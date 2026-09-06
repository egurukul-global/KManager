// ==================== BALANCE GUARDS (Phase 3) ====================
import { supabaseClient } from '../db.js';

const BALANCE_EPSILON = 0.01;

export function hasNonZeroBalance(balance) {
  return Math.abs(parseFloat(balance) || 0) >= BALANCE_EPSILON;
}

/**
 * Buckets on a team with non-zero balance.
 * @param {string} teamId
 * @param {string|null} ownerUserId - if set, only that member's buckets on this team
 */
export async function findNonZeroBucketsOnTeam(teamId, ownerUserId = null) {
  let query = supabaseClient
    .from('buckets')
    .select('id, name, balance, currency, owner_user_id')
    .eq('team_id', teamId)
    .eq('is_deleted', false);

  if (ownerUserId) {
    query = query.eq('owner_user_id', ownerUserId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).filter(b => hasNonZeroBalance(b.balance));
}

/** All non-zero buckets owned by a user (work-team member buckets). */
export async function findNonZeroMemberBucketsForUser(userId) {
  const { data, error } = await supabaseClient
    .from('buckets')
    .select('id, name, balance, currency, team_id, owner_user_id')
    .eq('owner_user_id', userId)
    .eq('is_deleted', false);

  if (error) throw error;
  return (data || []).filter(b => hasNonZeroBalance(b.balance));
}

export function formatNonZeroBucketList(buckets) {
  return buckets
    .map(b => `${b.name}: ${(parseFloat(b.balance) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} ${b.currency || ''}`)
    .join('; ');
}

/**
 * Checks if a bucket has been used in any transactions.
 */
export async function hasBucketTransactions(bucketId) {
  if (!bucketId) return false;
  
  const [transfersSource, transfersDest, expenses, incomes] = await Promise.all([
    supabaseClient.from('transfers').select('id', { count: 'exact', head: true }).eq('source_bucket_id', bucketId),
    supabaseClient.from('transfers').select('id', { count: 'exact', head: true }).eq('destination_bucket_id', bucketId),
    supabaseClient.from('expenses').select('id', { count: 'exact', head: true }).eq('bucket_id', bucketId),
    supabaseClient.from('income').select('id', { count: 'exact', head: true }).eq('bucket_id', bucketId)
  ]);

  return (transfersSource.count > 0 || transfersDest.count > 0 || expenses.count > 0 || incomes.count > 0);
}

