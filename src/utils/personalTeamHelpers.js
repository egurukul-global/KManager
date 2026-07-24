// ==================== PERSONAL TEAM (Fname_Lname) ====================
import { supabaseClient, sbInsert } from '../db.js';

/** Build base personal team name from display name: "Rishi Advait" → "Rishi_Advait" */
export function buildPersonalTeamBaseName(displayName) {
  const parts = String(displayName || 'User').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'User';
  if (parts.length === 1) return parts[0];
  return `${parts[0]}_${parts[parts.length - 1]}`;
}

/** Resolve unique team name: Rishi_Advait, Rishi_Advait2, Rishi_Advait3, … */
export async function resolvePersonalTeamName(baseName) {
  const root = buildPersonalTeamBaseName(baseName);
  const { data: existing, error } = await supabaseClient
    .from('teams')
    .select('name')
    .eq('is_personal_team', true)
    .ilike('name', `${root}%`);

  if (error) throw error;

  const taken = new Set((existing || []).map(t => t.name));
  if (!taken.has(root)) return root;

  let n = 2;
  while (taken.has(`${root}${n}`)) n += 1;
  return `${root}${n}`;
}

export async function findPersonalTeamForUser(userId) {
  if (!userId) return null;

  const { data, error } = await supabaseClient
    .from('teams')
    .select('id, name, personal_owner_user_id, is_personal_team')
    .eq('is_personal_team', true)
    .eq('personal_owner_user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function findPersonalTeamBucket(personalTeamId) {
  const { data, error } = await supabaseClient
    .from('buckets')
    .select('*')
    .eq('team_id', personalTeamId)
    .eq('is_deleted', false)
    .eq('is_protected', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Ensure user has a named personal team + protected USD bucket.
 * Called when user is first added to a work team.
 */
export async function ensurePersonalTeamForUser(userId, displayName, createdByUserId) {
  const existing = await findPersonalTeamForUser(userId);
  if (existing) {
    const bucket = await findPersonalTeamBucket(existing.id);
    return { team: existing, bucket, created: false };
  }

  const teamName = await resolvePersonalTeamName(displayName);
  const teamId = crypto.randomUUID();
  const now = new Date().toISOString();

  const { error: teamError } = await supabaseClient.from('teams').insert({
    id: teamId,
    name: teamName,
    is_personal_team: true,
    personal_owner_user_id: userId
  });
  if (teamError) throw teamError;

  const { error: membershipError } = await supabaseClient.from('user_teams').insert({
    id: crypto.randomUUID(),
    user_id: userId,
    team_id: teamId,
    access_level: 'lead',
    is_primary: false
  });
  if (membershipError) throw membershipError;

  const roleCodes = ['OPH', 'FIN', 'FIH'];
  const rraInserts = roleCodes.map(code => ({
    id: crypto.randomUUID(),
    user_id: userId,
    role_code: code,
    team_id: teamId,
    is_active: true,
    assigned_by: createdByUserId || userId
  }));

  const { error: rraError } = await supabaseClient.from('request_role_assignments').insert(rraInserts);
  if (rraError) throw rraError;

  const bucketPayload = {
    id: crypto.randomUUID(),
    team_id: teamId,
    name: teamName,
    type: 'bank',
    currency: 'USD',
    balance: 0,
    owner_user_id: null,
    is_protected: true,
    is_deleted: false,
    created_by: createdByUserId || userId,
    created_at: now
  };

  const bucketResult = await sbInsert('buckets', bucketPayload);
  if (bucketResult?.error) throw bucketResult.error;

  const bucket = bucketResult.data?.[0] || bucketPayload;
  return {
    team: { id: teamId, name: teamName, is_personal_team: true, personal_owner_user_id: userId },
    bucket,
    created: true
  };
}

/** Load personal team + USD bucket for a member (for cross-team transfers). */
export async function getMemberPersonalWallet(userId) {
  const team = await findPersonalTeamForUser(userId);
  if (!team) return null;
  const bucket = await findPersonalTeamBucket(team.id);
  if (!bucket) return null;
  return { team, bucket };
}
