// ==================== TRANSFER STATE MACHINE HELPERS ====================
import { getTransferDestAmount } from './financialStatusHelpers.js';
import { sbUpdate } from '../db.js';
import {
  TRANSFER_STATUS,
  TRANSFER_FLOW,
  PENDING_STEP,
  MEMO_MAX_LENGTH,
  isAcceptedTransfer,
  isPendingTransfer
} from './transferConstants.js';

export { TRANSFER_STATUS, TRANSFER_FLOW, PENDING_STEP, MEMO_MAX_LENGTH, isAcceptedTransfer, isPendingTransfer };

import { hasAnyGlobalFinanceRole } from './appRoles.js';
export function isTeamLeadAccess(state) {
  if (state.user?.role === 'admin' || state.user?.role === 'ceo') return true;
  const level = String(state.userTeamAccess?.access_level || '').toLowerCase().trim();
  return level === 'admin' || level === 'lead' || level === 'oht';
}

export function isOperationalBucket(bucket) {
  if (bucket.is_org_level === true) return false;
  return !bucket.owner_user_id;
}

export function isMemberBucket(bucket) {
  if (bucket.is_org_level === true) return false;
  return !!bucket.owner_user_id;
}

import { isFinanceGlobalAdmin } from './appRoles.js';

export function filterBucketsForTransferSource(buckets, state) {
  buckets = buckets.filter(b => b.is_active !== false);
  const lead = isTeamLeadAccess(state) || hasAnyGlobalFinanceRole();
  return buckets.filter(b => {
    if (b.is_org_level) {
      if (isFinanceGlobalAdmin()) return true;
      return b._can_transfer === true;
    }
    if (lead) return isOperationalBucket(b);
    return isMemberBucket(b) && b.owner_user_id === state.user?.id;
  });
}

export function filterBucketsForTransferDest(buckets, state, { showMembers = false, showTeam = false } = {}) {
  buckets = buckets.filter(b => b.is_active !== false);
  const lead = isTeamLeadAccess(state);
  const globalAdmin = hasAnyGlobalFinanceRole();
  const operational = buckets.filter(isOperationalBucket);
  const orgLevel = buckets.filter(b => b.is_org_level);

  if (globalAdmin) {
    let result = [...orgLevel];
    if (showTeam) result = result.concat(operational);
    if (showMembers) result = result.concat(buckets.filter(isMemberBucket));
    return result;
  }

  if (lead) {
    if (!showMembers) return operational.concat(orgLevel);
    return buckets.filter(b => isOperationalBucket(b) || isMemberBucket(b) || b.is_org_level);
  }

  if (showTeam) return operational.concat(orgLevel);
  return buckets.filter(b => (isMemberBucket(b) && b.owner_user_id === state.user?.id) || b.is_org_level);
}

export function classifyTransferFlow(srcBucket, destBucket, senderIsOtl) {
  if (isOperationalBucket(srcBucket) && isOperationalBucket(destBucket)) return TRANSFER_FLOW.OTL_OPERATIONAL;
  if (isOperationalBucket(srcBucket) && isMemberBucket(destBucket)) return TRANSFER_FLOW.OTL_TO_MEMBER;
  if (isMemberBucket(srcBucket) && isOperationalBucket(destBucket)) return TRANSFER_FLOW.OTM_TO_TEAM;
  if (isMemberBucket(srcBucket) && isMemberBucket(destBucket)) {
    if (srcBucket.team_id !== destBucket.team_id) return TRANSFER_FLOW.CROSS_TEAM_PERSONAL;
    return TRANSFER_FLOW.OTM_TO_MEMBER;
  }
  return TRANSFER_FLOW.OTL_OPERATIONAL; // fallback
}

export function validateTransferMemo(memo) {
  if (!memo) return false;
  return memo.trim().length <= MEMO_MAX_LENGTH;
}

export function computeDestAmount(amount, srcCurr, destCurr, rates) {
  if (srcCurr === destCurr) return amount;
  
  // Basic fallback calculation (rateForInput usually handles this in currency.js, but we can do a naive conversion if rates are missing)
  const srcRate = (rates || []).find(r => r.currency === srcCurr)?.rate || 1;
  const destRate = (rates || []).find(r => r.currency === destCurr)?.rate || 1;
  
  // amount in USD = amount / srcRate
  // dest amount = (amount / srcRate) * destRate
  const result = (parseFloat(amount) / parseFloat(srcRate)) * parseFloat(destRate);
  return parseFloat(result.toFixed(2));
}

export async function applyAcceptedTransferBalances(payload, srcBucket, destBucket, rates) {
  // Dummy function for local cache mutation if needed, or backend handles it via triggers.
  // We'll leave it empty/basic since the backend often handles it or it triggers a re-fetch.
}

export function getTransferStatusBadge(status) {
  switch (status) {
    case TRANSFER_STATUS.PENDING: return '<span class="badge warning">Pending</span>';
    case TRANSFER_STATUS.ACCEPTED: return '<span class="badge success">Accepted</span>';
    case TRANSFER_STATUS.REJECTED: return '<span class="badge danger">Rejected</span>';
    default: return '<span class="badge info">Unknown</span>';
  }
}

export function isCrossTeamTransfer(transfer) {
  return transfer && transfer.source_team_id !== transfer.dest_team_id;
}

export function userCanApproveOhf(transfer, state) {
  return state.user?.role === 'admin' || state.user?.role === 'ohf' || state.user?.role === 'ceo' || state.user?.role === 'cao';
}

export function userCanReceivePendingTransfer(transfer, state) {
  return transfer && transfer.receiver_user_id === state.user?.id;
}

export function isOhfApprover(state) {
  return state.user?.role === 'admin' || state.user?.role === 'ohf' || state.user?.role === 'ceo' || state.user?.role === 'cao';
}
