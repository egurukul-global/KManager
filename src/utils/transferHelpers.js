// ==================== TRANSFER STATE MACHINE HELPERS ====================
import { getTransferDestAmount } from './financialStatusHelpers.js';
import { sbUpdate } from '../db.js';
import {
  TRANSFER_STATUS,
  TRANSFER_FLOW,
  MEMO_MAX_LENGTH,
  isAcceptedTransfer,
  isPendingTransfer
} from './transferConstants.js';

export { TRANSFER_STATUS, TRANSFER_FLOW, MEMO_MAX_LENGTH, isAcceptedTransfer, isPendingTransfer };

export function isOperationalBucket(bucket) {
  return bucket && !bucket.owner_user_id;
}

export function isMemberBucket(bucket) {
  return bucket && !!bucket.owner_user_id;
}

export function isTeamLeadAccess(state) {
  const level = state.userTeamAccess?.access_level || 'member';
  const role = state.user?.role || 'user';
  if (['admin', 'caoh', 'oh', 'ceo'].includes(role)) return true;
  return level === 'lead' || level === 'admin';
}

export function isTeamMemberAccess(state) {
  const level = state.userTeamAccess?.access_level || 'member';
  return level === 'member';
}

/** Classify same-team transfer flow from sender role and bucket types. */
export function classifyTransferFlow(srcBucket, destBucket, senderIsOtl) {
  const srcOp = isOperationalBucket(srcBucket);
  const destOp = isOperationalBucket(destBucket);
  const destMember = isMemberBucket(destBucket);

  if (senderIsOtl) {
    if (srcOp && destOp) {
      return {
        flow: TRANSFER_FLOW.OTL_OPERATIONAL,
        status: TRANSFER_STATUS.ACCEPTED,
        receiver_user_id: null,
        receiver_kind: null
      };
    }
    if (srcOp && destMember) {
      return {
        flow: TRANSFER_FLOW.OTL_TO_MEMBER,
        status: TRANSFER_STATUS.PENDING,
        receiver_user_id: destBucket.owner_user_id,
        receiver_kind: 'member'
      };
    }
    // OTL from member bucket — treat as pending to dest
    if (destMember) {
      return {
        flow: TRANSFER_FLOW.OTL_TO_MEMBER,
        status: TRANSFER_STATUS.PENDING,
        receiver_user_id: destBucket.owner_user_id,
        receiver_kind: 'member'
      };
    }
    if (destOp) {
      return {
        flow: TRANSFER_FLOW.OTL_OPERATIONAL,
        status: TRANSFER_STATUS.ACCEPTED,
        receiver_user_id: null,
        receiver_kind: null
      };
    }
  }

  // OTM sender — only from own member bucket (enforced in UI)
  if (destOp) {
    return {
      flow: TRANSFER_FLOW.OTM_TO_TEAM,
      status: TRANSFER_STATUS.PENDING,
      receiver_user_id: null,
      receiver_kind: 'otl'
    };
  }
  if (destMember) {
    return {
      flow: TRANSFER_FLOW.OTM_TO_MEMBER,
      status: TRANSFER_STATUS.PENDING,
      receiver_user_id: destBucket.owner_user_id,
      receiver_kind: 'member'
    };
  }

  return {
    flow: TRANSFER_FLOW.OTM_TO_MEMBER,
    status: TRANSFER_STATUS.PENDING,
    receiver_user_id: destBucket?.owner_user_id || null,
    receiver_kind: 'member'
  };
}

export function validateTransferMemo(memo) {
  const text = String(memo || '').trim();
  if (!text) return { ok: false, message: 'Memo is required' };
  if (text.length > MEMO_MAX_LENGTH) {
    return { ok: false, message: `Memo must be ${MEMO_MAX_LENGTH} characters or fewer` };
  }
  return { ok: true, value: text };
}

export function computeDestAmount(transfer, destBucket, rates) {
  return getTransferDestAmount(transfer, destBucket, rates);
}

/** Apply balance changes when a transfer is accepted. */
export async function applyAcceptedTransferBalances(transfer, srcBucket, destBucket, rates) {
  const srcAmount = parseFloat(transfer.amount) || 0;
  const destAmount = parseFloat(transfer.dest_amount) || computeDestAmount(transfer, destBucket, rates);
  const srcBalance = (parseFloat(srcBucket.balance) || 0) - srcAmount;
  const destBalance = (parseFloat(destBucket.balance) || 0) + destAmount;

  const srcResult = await sbUpdate('buckets', { id: srcBucket.id, balance: srcBalance });
  if (srcResult.error) throw srcResult.error;

  const destResult = await sbUpdate('buckets', { id: destBucket.id, balance: destBalance });
  if (destResult.error) throw destResult.error;

  return { srcBalance, destBalance, destAmount };
}

export function getTransferStatusBadge(status) {
  const s = status || TRANSFER_STATUS.ACCEPTED;
  if (s === TRANSFER_STATUS.PENDING) return { label: 'Pending', class: 'badge-warning' };
  if (s === TRANSFER_STATUS.REJECTED) return { label: 'Rejected', class: 'badge-secondary' };
  return { label: 'Accepted', class: 'badge-success' };
}

export function userCanReceivePendingTransfer(transfer, state) {
  if (!isPendingTransfer(transfer)) return false;
  if (transfer.receiver_user_id && transfer.receiver_user_id === state.user?.id) return true;
  if (transfer.receiver_kind === 'otl' && isTeamLeadAccess(state)) return true;
  return false;
}

export function filterBucketsForTransferSource(buckets, state) {
  const lead = isTeamLeadAccess(state);
  if (lead) {
    return buckets.filter(b => isOperationalBucket(b));
  }
  return buckets.filter(b => isMemberBucket(b) && b.owner_user_id === state.user?.id);
}

export function filterBucketsForTransferDest(buckets, state, { showMembers = false, showTeam = false } = {}) {
  const lead = isTeamLeadAccess(state);
  const operational = buckets.filter(isOperationalBucket);

  if (lead) {
    if (!showMembers) return operational;
    return buckets.filter(b => isOperationalBucket(b) || isMemberBucket(b));
  }

  // OTM default: team operational only
  let list = operational;
  if (showTeam && showMembers) {
    list = buckets.filter(b => isOperationalBucket(b) || isMemberBucket(b));
  } else if (showMembers) {
    list = buckets.filter(isMemberBucket);
  }
  return list.filter(b => b.owner_user_id !== state.user?.id || isOperationalBucket(b));
}
