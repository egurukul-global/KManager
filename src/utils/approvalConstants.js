// ==================== APPROVAL STATUSES (Phase 4A) ====================

export const APPROVAL_STATUS = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  REJECTED: 'REJECTED'
};

export function approvalStatusBadge(status) {
  const s = String(status || 'DRAFT').toUpperCase();
  if (s === 'DRAFT') return { label: 'Draft', class: 'badge-secondary' };
  if (s === 'SUBMITTED') return { label: 'Submitted', class: 'badge-info' };
  if (s === 'REJECTED') return { label: 'Rejected', class: 'badge-danger' };
  if (s.startsWith('CLARIFY-')) return { label: s.replace('CLARIFY-', 'Clarify '), class: 'badge-warning' };
  if (s.endsWith('-APPROVED')) return { label: s.replace('-APPROVED', ' Approved'), class: 'badge-success' };
  if (s.endsWith('-REVIEWED')) return { label: s.replace('-REVIEWED', ' Reviewed'), class: 'badge-info' };
  return { label: s, class: 'badge-secondary' };
}
