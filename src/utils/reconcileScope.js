// ==================== RECONCILIATION SCOPE (Phase 4A) ====================
import { state } from '../state.js';
import { isOpsStaff, isOplOrAbove } from './roleLabels.js';
import { bucketHasMoney } from './financialStatusHelpers.js';

const BALANCE_EPSILON = 0.01;

export function bucketNeedsReconcile(bucket) {
  return Math.abs(parseFloat(bucket?.balance) || 0) >= BALANCE_EPSILON;
}

/**
 * Buckets the current user may submit in reconcile on this work team.
 */
export function bucketsForReconcileSubmit(buckets, teamId = state.currentTeam?.team_id) {
  const userId = state.user?.id;
  const level = String(state.userTeamAccess?.access_level || 'member').toLowerCase().trim();
  const onTeam = (buckets || []).filter(b => !b.is_deleted && b.team_id === teamId);

  if (state.user?.role === 'admin') {
    return onTeam.filter(bucketNeedsReconcile);
  }

  if (isOpsStaff(level)) {
    return onTeam.filter(b => b.owner_user_id === userId && bucketNeedsReconcile(b));
  }

  if (isOplOrAbove(level) || level === 'admin') {
    return onTeam.filter(b => {
      if (!bucketNeedsReconcile(b)) return false;
      if (!b.owner_user_id) return true;
      return b.owner_user_id === userId;
    });
  }

  return [];
}

/**
 * All buckets requiring reconcile on work team (for OPL progress).
 */
export function bucketsRequiredForTeamReconcile(buckets, teamId = state.currentTeam?.team_id) {
  return (buckets || []).filter(
    b => !b.is_deleted && b.team_id === teamId && bucketNeedsReconcile(b)
  );
}

/**
 * Given today's reconciled bucket ids, compute team progress.
 */
export function computeTeamReconcileProgress(requiredBuckets, reconciledBucketIds) {
  const required = requiredBuckets || [];
  const doneSet = new Set(reconciledBucketIds || []);
  const pending = required.filter(b => !doneSet.has(b.id));
  const reconciled = required.length - pending.length;

  const pendingByOwner = new Map();
  pending.forEach(b => {
    if (b.owner_user_id) {
      const key = b.owner_user_id;
      pendingByOwner.set(key, (pendingByOwner.get(key) || 0) + 1);
    }
  });

  return {
    required: required.length,
    reconciled,
    pending: pending.length,
    pendingBuckets: pending,
    pendingOwnerIds: [...pendingByOwner.keys()],
    label: required.length ? `${reconciled} of ${required.length}` : '—'
  };
}
