import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FN_VERSION = 'create-user-v5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

function asText(err, fallback) {
  if (typeof err === 'string' && err.trim() && err.trim() !== '{}') return err.trim();
  if (!err || typeof err !== 'object') return fallback;

  const bits = [];
  for (const key of ['message', 'msg', 'error_description', 'details', 'hint', 'code', 'status']) {
    const v = err[key];
    if (typeof v === 'string' && v.trim() && v.trim() !== '{}') bits.push(v.trim());
    else if (typeof v === 'number') bits.push(String(v));
  }
  if (bits.length) return bits.join(' | ');
  return fallback;
}

function reply(payload, status = 200) {
  return new Response(JSON.stringify({ fn: FN_VERSION, ...payload }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

function fail(message, status = 400) {
  const text = asText(message, 'Create user failed');
  return reply({ error: text === '{}' ? 'Create user failed (empty server error)' : text }, status);
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

  let step = 'init';

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !serviceKey || !anonKey) {
      return fail('Server configuration missing (URL/keys)', 500);
    }

    step = 'auth-header';
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return fail('Unauthorized — missing login token', 401);

    step = 'caller';
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: authData, error: authErr } = await callerClient.auth.getUser();
    if (authErr || !authData?.user) {
      return fail(asText(authErr, 'Unauthorized — sign in again'), 401);
    }

    const callerId = authData.user.id;
    const admin = createClient(supabaseUrl, serviceKey);

    step = 'caller-role';
    const { data: callerProfile, error: callerProfileErr } = await admin
      .from('users')
      .select('role')
      .eq('id', callerId)
      .maybeSingle();

    if (callerProfileErr) {
      return fail(`Could not read your profile: ${asText(callerProfileErr, 'profile read failed')}`, 400);
    }

    const { data: okAdminRow } = await admin
      .from('ok_admins')
      .select('user_id')
      .eq('user_id', callerId)
      .maybeSingle();

    const callerRole = String(callerProfile?.role || '').toLowerCase();
    const isOkAdmin = !!okAdminRow;
    const isFinanceOrgAdmin = ['admin', 'caoh', 'oh', 'ceo'].includes(callerRole);
    if (!isOkAdmin && !isFinanceOrgAdmin) {
      return fail(`Only One Kailasa admins (or Finance org admins) can create users (your role: ${callerRole || 'none'})`, 403);
    }

    step = 'body';
    const body = await req.json();
    const email = String(body.email || '').trim().toLowerCase();
    const name = String(body.name || '').trim();
    const password = String(body.password || '');
    let role = String(body.role || 'user').toLowerCase();
    const workTeamId = body.team_id || null;
    const accessLevel = String(body.access_level || 'member').toLowerCase();

    if (!email) return fail('Email is required');
    if (!name) return fail('Full name is required');
    if (password.length < 8) return fail('Password must be at least 8 characters');

    if (callerRole !== 'admin' && role === 'admin') {
      return fail('Only system admin can assign SYS role', 403);
    }

    const allowedRoles = callerRole === 'admin'
      ? ['user', 'oh', 'caoh', 'ceo', 'admin']
      : callerRole === 'caoh'
        ? ['user', 'oh', 'caoh', 'ceo']
        : callerRole === 'oh'
          ? ['user', 'oh']
          : ['user'];

    if (!allowedRoles.includes(role)) role = 'user';

    step = 'create-auth';
    const { data: createdAuth, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name }
    });

    if (createErr) {
      const msg = asText(createErr, 'Could not create login account');
      const lower = msg.toLowerCase();
      if (lower.includes('already') || lower.includes('registered') || lower.includes('exists')) {
        return fail(`Email already registered in Authentication. Delete ${email} under Authentication → Users, then retry.`);
      }
      return fail(`Auth create failed: ${msg}`);
    }

    const userId = createdAuth?.user?.id;
    if (!userId) return fail('Auth create returned no user id');

    step = 'personal-team';
    let personalTeam = null;
    let personalTeamWarning = '';
    try {
      personalTeam = await ensurePersonalTeam(admin, userId, name, callerId);
    } catch (teamSetupErr) {
      personalTeamWarning = asText(teamSetupErr, 'personal team failed');
    }

    step = 'profile';
    const profilePayload = {
      id: userId,
      email,
      name,
      role,
      on_hold: false
    };
    if (personalTeam?.id) profilePayload.team_id = personalTeam.id;

    let { error: profileErr } = await admin.from('users').upsert(profilePayload, { onConflict: 'id' });

    if (profileErr && personalTeam?.id) {
      const retry = await admin.from('users').upsert({
        id: userId,
        email,
        name,
        role,
        on_hold: false
      }, { onConflict: 'id' });
      if (!retry.error) profileErr = null;
      else profileErr = retry.error;
    }

    if (profileErr) {
      return fail(
        `Auth login created for ${email}, but profile save failed at step "${step}": ${asText(profileErr, 'profile error')}. ` +
        `If this mentions role/check, run the users_role_check SQL. The login may now appear under Authentication → Users.`
      );
    }

    step = 'work-team';
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
        personalTeamWarning = (personalTeamWarning ? personalTeamWarning + ' | ' : '') +
          asText(teamErr, 'work team link failed');
      }
    }

    return reply({
      ok: true,
      user_id: userId,
      email,
      name,
      role,
      warning: personalTeamWarning || undefined
    });
  } catch (err) {
    console.error('create-user:', step, err);
    return fail(`Unexpected error at step "${step}": ${asText(err, 'internal error')}`, 500);
  }
});
