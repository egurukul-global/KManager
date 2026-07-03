// ==================== USER + TEAM FORM DEFAULTS ====================
import { supabaseClient } from '../db.js';
import { state } from '../state.js';

const memoryCache = new Map();

export const EMPTY_TEAM_DEFAULTS = {
  budget_id: '',
  category_value: '',
  category_label: '',
  bucket_id: '',
  currency: '',
  exchange_rate: '',
  payment_from: '',
  transfer_from_bucket_id: '',
  transfer_to_bucket_id: ''
};

function cacheKey(teamId, userId) {
  return `${userId}:${teamId}`;
}

export function normalizeTeamDefaults(raw) {
  const merged = { ...EMPTY_TEAM_DEFAULTS, ...(raw || {}) };
  for (const key of Object.keys(EMPTY_TEAM_DEFAULTS)) {
    if (merged[key] === null || merged[key] === undefined) merged[key] = '';
  }
  return merged;
}

/** Current team defaults from session state (call loadUserTeamDefaultsForCurrentTeam first). */
export function getUserTeamDefaults() {
  if (state.teamDefaultsTeamId === state.currentTeam?.team_id && state.teamDefaults) {
    return state.teamDefaults;
  }
  return normalizeTeamDefaults({});
}

export function invalidateUserTeamDefaultsCache(teamId, userId) {
  if (teamId && userId) memoryCache.delete(cacheKey(teamId, userId));
}

async function fetchFromDatabase(teamId, userId) {
  const { data, error } = await supabaseClient
    .from('user_team_defaults')
    .select('defaults')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return normalizeTeamDefaults(data?.defaults);
}

/** One-time import from legacy localStorage expense defaults. */
export async function migrateLocalExpenseDefaults(teamId, userId) {
  if (!teamId || !userId) return;

  try {
    const legacyKey = `km_expense_defaults_${teamId}`;
    const raw = localStorage.getItem(legacyKey);
    if (!raw) return;

    const parsed = normalizeTeamDefaults(JSON.parse(raw));
    const { data: existing } = await supabaseClient
      .from('user_team_defaults')
      .select('user_id')
      .eq('team_id', teamId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!existing) {
      await supabaseClient.from('user_team_defaults').upsert({
        user_id: userId,
        team_id: teamId,
        defaults: parsed,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,team_id' });
    }

    localStorage.removeItem(legacyKey);
  } catch (err) {
    console.warn('Legacy defaults migration skipped:', err.message);
  }
}

export async function loadUserTeamDefaultsForCurrentTeam() {
  const teamId = state.currentTeam?.team_id;
  const userId = state.user?.id;

  if (!teamId || !userId) {
    state.teamDefaults = normalizeTeamDefaults({});
    state.teamDefaultsTeamId = null;
    return state.teamDefaults;
  }

  invalidateUserTeamDefaultsCache(teamId, userId);

  try {
    await migrateLocalExpenseDefaults(teamId, userId);
    const defs = await fetchFromDatabase(teamId, userId);
    memoryCache.set(cacheKey(teamId, userId), defs);
    state.teamDefaults = defs;
    state.teamDefaultsTeamId = teamId;
    return defs;
  } catch (err) {
    console.warn('Load user team defaults failed:', err.message);
    state.teamDefaults = normalizeTeamDefaults({});
    state.teamDefaultsTeamId = teamId;
    return state.teamDefaults;
  }
}

export async function saveUserTeamDefaults(partial) {
  const teamId = state.currentTeam?.team_id;
  const userId = state.user?.id;
  if (!teamId || !userId) throw new Error('Not signed in to a team');

  const merged = normalizeTeamDefaults({
    ...getUserTeamDefaults(),
    ...(partial || {})
  });

  const { error } = await supabaseClient.from('user_team_defaults').upsert({
    user_id: userId,
    team_id: teamId,
    defaults: merged,
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id,team_id' });

  if (error) throw error;

  memoryCache.set(cacheKey(teamId, userId), merged);
  state.teamDefaults = merged;
  state.teamDefaultsTeamId = teamId;
  return merged;
}

export async function clearUserTeamDefaults() {
  return saveUserTeamDefaults({ ...EMPTY_TEAM_DEFAULTS });
}

/** Pre-fill Record Income from saved defaults. Returns budget_id if set. */
export function applyDefaultsToIncomeForm({ bucketSelect, paymentFromEl } = {}) {
  const defs = getUserTeamDefaults();
  if (defs.payment_from && paymentFromEl) paymentFromEl.value = defs.payment_from;
  if (defs.bucket_id && bucketSelect) {
    bucketSelect.value = defs.bucket_id;
    if (typeof window.onIncomeBucketChange === 'function') {
      window.onIncomeBucketChange(bucketSelect);
    }
  }
  return defs.budget_id || '';
}

/** Pre-fill Transfer from saved defaults (bucket_id used as source if no transfer source set). */
export function applyDefaultsToTransferForm({ sourceSelect, destSelect } = {}) {
  const defs = getUserTeamDefaults();
  const fromId = defs.transfer_from_bucket_id || defs.bucket_id;
  if (fromId && sourceSelect) sourceSelect.value = fromId;
  if (defs.transfer_to_bucket_id && destSelect) destSelect.value = defs.transfer_to_bucket_id;
}
