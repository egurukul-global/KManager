// ==================== WORK-TEAM MEMBER BUCKET (one per member) ====================
import { supabaseClient, sbInsert } from '../db.js';
import { buildPersonalTeamBaseName } from './personalTeamHelpers.js';

/** Member bucket name base from display name. */
export function buildMemberBucketBaseName(displayName) {
  return buildPersonalTeamBaseName(displayName);
}

async function isPersonalWorkTeam(teamId) {
  const { data, error } = await supabaseClient
    .from('teams')
    .select('is_personal_team')
    .eq('id', teamId)
    .maybeSingle();

  if (error) throw error;
  return !!data?.is_personal_team;
}

async function findMemberBucketOnTeam(teamId, userId) {
  const { data, error } = await supabaseClient
    .from('buckets')
    .select('*')
    .eq('team_id', teamId)
    .eq('owner_user_id', userId)
    .eq('is_deleted', false)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function resolveMemberBucketName(teamId, baseName) {
  const { data: existing, error } = await supabaseClient
    .from('buckets')
    .select('name')
    .eq('team_id', teamId)
    .ilike('name', `${baseName}%`);

  if (error) throw error;

  const taken = new Set((existing || []).map(b => b.name));
  if (!taken.has(baseName)) return baseName;

  let n = 2;
  while (taken.has(`${baseName}${n}`)) n += 1;
  return `${baseName}${n}`;
}

/**
 * Ensure one member bucket on a work team when user is added.
 * Skips personal teams (they use protected team bucket instead).
 */
export async function ensureMemberBucketOnWorkTeam(teamId, userId, displayName, createdByUserId) {
  if (await isPersonalWorkTeam(teamId)) {
    return { bucket: null, created: false, skipped: true };
  }

  const existing = await findMemberBucketOnTeam(teamId, userId);
  if (existing) {
    return { bucket: existing, created: false, skipped: false };
  }

  const baseName = buildMemberBucketBaseName(displayName);
  const name = await resolveMemberBucketName(teamId, baseName);
  const now = new Date().toISOString();

  const payload = {
    id: crypto.randomUUID(),
    team_id: teamId,
    name,
    type: 'bank',
    currency: 'USD',
    balance: 0,
    owner_user_id: userId,
    is_protected: false,
    is_deleted: false,
    created_by: createdByUserId || userId,
    created_at: now
  };

  const result = await sbInsert('buckets', payload);
  if (result?.error) throw result.error;

  const bucket = result.data?.[0] || payload;
  return { bucket, created: true, skipped: false };
}
