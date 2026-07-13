import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

function errorMessage(err, fallback = 'Unknown error') {
  if (!err) return fallback;
  if (typeof err === 'string' && err.trim()) return err.trim();

  const parts = [
    err.message,
    err.msg,
    err.error_description,
    err.details,
    err.hint,
    err.code ? `code ${err.code}` : ''
  ].filter(p => typeof p === 'string' && p.trim());

  if (parts.length) return parts.join(' — ');

  try {
    const raw = JSON.stringify(err);
    if (raw && raw !== '{}' && raw !== 'null') return raw;
  } catch (_) { /* ignore */ }
  return fallback;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

function errorResponse(err, status = 400, fallback = 'Request failed') {
  return jsonResponse({ error: errorMessage(err, fallback) }, status);
}

function buildPersonalTeamBaseName(displayName) {
  const parts = String(displayName || 'User').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'User';
  if (parts.length === 1) return parts[0];
  return `${parts[0]}_${parts[parts.length - 1]}`;
}

async function resolvePersonalTeamName(admin, baseName) {
  const root = buildPersonalTeamBaseName(baseName);
  const { data: existing } = await admin
    .from('teams')
    .select('name')
    .eq('is_personal_team', true)
    .ilike('name', `${root}%`);

  const taken = new Set((existing || []).map(t => t.name));
  if (!taken.has(root)) return root;
  let n = 2;
  while (taken.has(`${root}${n}`)) n += 1;
  return `${root}${n}`;
}

async function ensurePersonalTeam(admin, userId, displayName, createdBy) {
  const { data: existing } = await admin
    .from('teams')
    .select('id, name')
    .eq('is_personal_team', true)
    .eq('personal_owner_user_id', userId)
    .maybeSingle();

  if (existing) return existing;

  const teamName = await resolvePersonalTeamName(admin, displayName);
  const teamId = crypto.randomUUID();
  const now = new Date().toISOString();

  const { error: teamErr } = await admin.from('teams').insert({
    id: teamId,
    name: teamName,
    is_personal_team: true,
    personal_owner_user_id: userId
  });
  if (teamErr) throw teamErr;

  const { error: memErr } = await admin.from('user_teams').insert({
    id: crypto.randomUUID(),
    user_id: userId,
    team_id: teamId,
    access_level: 'lead',
    is_primary: false
  });
  if (memErr) throw memErr;

  const { error: bucketErr } = await admin.from('buckets').insert({
    id: crypto.randomUUID(),
    team_id: teamId,
    name: teamName,
    type: 'bank',
    currency: 'USD',
    balance: 0,
    owner_user_id: null,
    is_protected: true,
    is_deleted: false,
    created_by: createdBy || userId,
    created_at: now
  });
  if (bucketErr) throw bucketErr;

  return { id: teamId, name: teamName };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !serviceKey || !anonKey) {
      return errorResponse('Server configuration missing', 500);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse('Unauthorized — missing login token', 401);
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: authData, error: authErr } = await callerClient.auth.getUser();
    if (authErr || !authData?.user) {
      return errorResponse(authErr || 'Unauthorized — sign in again', 401);
    }

    const callerId = authData.user.id;
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: callerProfile } = await admin
      .from('users')
      .select('role')
      .eq('id', callerId)
      .maybeSingle();

    const callerRole = String(callerProfile?.role || '').toLowerCase();
    if (!['admin', 'caoh', 'oh', 'ceo'].includes(callerRole)) {
      return errorResponse('Only org administrators can create users', 403);
    }

    const body = await req.json();
    const email = String(body.email || '').trim().toLowerCase();
    const name = String(body.name || '').trim();
    const password = String(body.password || '');
    let role = String(body.role || 'user').toLowerCase();
    const workTeamId = body.team_id || null;
    const accessLevel = String(body.access_level || 'member').toLowerCase();

    if (!email || !name || password.length < 8) {
      return errorResponse('Email, full name, and password (min 8 chars) are all required', 400);
    }

    if (callerRole !== 'admin' && role === 'admin') {
      return errorResponse('Only system admin can assign SYS role', 403);
    }

    const allowedRoles = callerRole === 'admin'
      ? ['user', 'oh', 'caoh', 'ceo', 'admin']
      : callerRole === 'caoh'
        ? ['user', 'oh', 'caoh', 'ceo']
        : callerRole === 'oh'
          ? ['user', 'oh']
          : ['user'];

    if (!allowedRoles.includes(role)) {
      role = 'user';
    }

    const { data: createdAuth, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name }
    });

    if (createErr) {
      const msg = errorMessage(createErr, 'Could not create login account');
      const lower = msg.toLowerCase();
      if (lower.includes('already') || lower.includes('registered') || lower.includes('exists')) {
        return errorResponse(
          `This email already has a login. In Supabase go to Authentication → Users, delete ${email}, then try again.`,
          400
        );
      }
      return errorResponse(msg, 400, 'Could not create login account');
    }

    const userId = createdAuth.user.id;
    let personalTeam = null;
    let personalTeamWarning = '';

    try {
      personalTeam = await ensurePersonalTeam(admin, userId, name, callerId);
    } catch (teamSetupErr) {
      console.error('Personal team setup:', teamSetupErr);
      personalTeamWarning = errorMessage(teamSetupErr);
    }

    // Prefer personal team as users.team_id when the column is required
    const profilePayload = {
      id: userId,
      email,
      name,
      role,
      on_hold: false
    };
    if (personalTeam?.id) {
      profilePayload.team_id = personalTeam.id;
    }

    let { error: profileErr } = await admin.from('users').upsert(profilePayload, { onConflict: 'id' });

    // Retry without team_id if that column rejects the value
    if (profileErr && personalTeam?.id) {
      const retry = await admin.from('users').upsert({
        id: userId,
        email,
        name,
        role,
        on_hold: false
      }, { onConflict: 'id' });
      if (!retry.error) profileErr = null;
    }

    if (profileErr) {
      // Keep auth user so we can see what failed; do not silent-delete
      return errorResponse(
        `Login was created, but profile save failed: ${errorMessage(profileErr)}. ` +
        `Check Supabase → Authentication → Users for ${email}. ` +
        `Common fix: run the users_role_check SQL so role "user" is allowed.`,
        400
      );
    }

    if (workTeamId) {
      const validLevels = ['view', 'member', 'lead', 'oht', 'admin'];
      const level = validLevels.includes(accessLevel) ? accessLevel : 'member';
      const { error: teamErr } = await admin.from('user_teams').insert({
        id: crypto.randomUUID(),
        user_id: userId,
        team_id: workTeamId,
        access_level: level,
        is_primary: false
      });
      if (teamErr) {
        console.warn('Work team membership failed:', errorMessage(teamErr));
      }
    }

    return jsonResponse({
      ok: true,
      user_id: userId,
      email,
      name,
      role,
      warning: personalTeamWarning
        ? `User created but personal team failed: ${personalTeamWarning}`
        : undefined
    });
  } catch (err) {
    console.error('create-user:', err);
    return errorResponse(err, 500, 'Internal error');
  }
});
