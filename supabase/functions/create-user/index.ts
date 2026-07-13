import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
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
      return jsonResponse({ error: 'Server configuration missing' }, 500);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: authData, error: authErr } = await callerClient.auth.getUser();
    if (authErr || !authData?.user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
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
      return jsonResponse({ error: 'Only org administrators can create users' }, 403);
    }

    const body = await req.json();
    const email = String(body.email || '').trim().toLowerCase();
    const name = String(body.name || '').trim();
    const password = String(body.password || '');
    let role = String(body.role || 'user').toLowerCase();
    const teamId = body.team_id || null;
    const accessLevel = String(body.access_level || 'member').toLowerCase();

    if (!email || !name || password.length < 8) {
      return jsonResponse({ error: 'Email, name, and password (min 8 chars) are required' }, 400);
    }

    if (callerRole !== 'admin' && role === 'admin') {
      return jsonResponse({ error: 'Only system admin can assign SYS role' }, 403);
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
      return jsonResponse({ error: createErr.message }, 400);
    }

    const userId = createdAuth.user.id;

    const { error: profileErr } = await admin.from('users').upsert({
      id: userId,
      email,
      name,
      role,
      on_hold: false
    }, { onConflict: 'id' });

    if (profileErr) {
      await admin.auth.admin.deleteUser(userId);
      return jsonResponse({ error: profileErr.message }, 400);
    }

    await ensurePersonalTeam(admin, userId, name, callerId);

    if (teamId) {
      const validLevels = ['view', 'member', 'lead', 'oht', 'admin'];
      const level = validLevels.includes(accessLevel) ? accessLevel : 'member';
      const { error: teamErr } = await admin.from('user_teams').insert({
        id: crypto.randomUUID(),
        user_id: userId,
        team_id: teamId,
        access_level: level,
        is_primary: false
      });
      if (teamErr) {
        console.warn('Work team membership failed:', teamErr.message);
      }
    }

    return jsonResponse({
      ok: true,
      user_id: userId,
      email,
      name,
      role
    });
  } catch (err) {
    console.error('create-user:', err);
    return jsonResponse({ error: err.message || 'Internal error' }, 500);
  }
});
