// ==================== TRANSFER CONSTANTS (no deps) ====================

export const TRANSFER_STATUS = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED'
};

export const TRANSFER_FLOW = {
  OTL_OPERATIONAL: 'otl_operational',
  OTL_TO_MEMBER: 'otl_to_member',
  OTM_TO_TEAM: 'otm_to_team',
  OTM_TO_MEMBER: 'otm_to_member',
  CROSS_TEAM_PERSONAL: 'cross_team_personal'
};

export const PENDING_STEP = {
  OHF: 'ohf',
  RECEIVER: 'receiver'
};

export const MEMO_MAX_LENGTH = 30;

export function isAcceptedTransfer(transfer) {
  if (!transfer || transfer.is_deleted) return false;
  const status = transfer.status || TRANSFER_STATUS.ACCEPTED;
  return status === TRANSFER_STATUS.ACCEPTED;
}

export function isPendingTransfer(transfer) {
  return transfer && !transfer.is_deleted && transfer.status === TRANSFER_STATUS.PENDING;
}
