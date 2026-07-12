// ==================== BUCKET VISIBILITY (Phase 4A) ====================
import { state } from '../state.js';
import { isOpsStaff } from './roleLabels.js';

/**
 * Filter buckets visible on current team for the active user.
 * OPS: own member buckets only (no team operational, no other members').
 */
export function filterBucketsForCurrentUser(buckets, teamId = state.currentTeam?.team_id) {
  const list = (buckets || []).filter(b => !b.is_deleted && b.team_id === teamId);
  const level = String(state.userTeamAccess?.access_level || 'member').toLowerCase().trim();
  const userId = state.user?.id;

  if (state.user?.role === 'admin') return list;

  if (isOpsStaff(level)) {
    return list.filter(b => b.owner_user_id === userId);
  }

  return list;
}

export function splitTeamAndPersonalBuckets(buckets) {
  const team = [];
  const personal = [];
  (buckets || []).forEach(b => {
    if (b.owner_user_id) personal.push(b);
    else team.push(b);
  });
  return { team, personal };
}
