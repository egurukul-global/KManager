import { state } from '../state.js';
import { isSystemAdmin } from './navPermissions.js';

/** Single budget lifecycle status (replaces dual status + approval badges in UI). */
export const BUDGET_STATUS = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  REJECTED: 'rejected',
  APPROVED: 'approved',
  PAID: 'paid',
  RECEIVED: 'received',
  ARCHIVED: 'archived'
};

export const BUDGET_STATUS_LABELS = {
  draft: 'Draft',
  submitted: 'Submitted',
  rejected: 'Rejected',
  approved: 'Approved',
  paid: 'Paid',
  received: 'Received',
  archived: 'Archived'
};

/** Map approval-engine values to the budget statuses. */
export function mapApprovalToBudgetStatus(approvalStatus) {
  const s = String(approvalStatus || '').toUpperCase();
  if (s === 'DRAFT') return BUDGET_STATUS.DRAFT;
  if (s === 'REJECTED') return BUDGET_STATUS.REJECTED;
  if (s === 'FIP-APPROVED' || s === 'PAID') return BUDGET_STATUS.PAID;
  if (s.endsWith('-APPROVED')) return BUDGET_STATUS.APPROVED;
  if (s === 'SUBMITTED' || s.endsWith('-REVIEWED') || s.startsWith('CLARIFY-')) {
    return BUDGET_STATUS.SUBMITTED;
  }
  return null;
}

/**
 * Normalize legacy + dual-field budgets to one of five statuses.
 * Legacy: current → approved, archive → archived.
 * If status is still draft/current but approval_status advanced, prefer approval.
 */
export function getBudgetStatus(budget) {
  if (!budget) return BUDGET_STATUS.DRAFT;

  const raw = String(budget.status || '').toLowerCase().trim();
  let fromStatus = raw;
  if (raw === 'current') fromStatus = BUDGET_STATUS.APPROVED;
  if (raw === 'archive') fromStatus = BUDGET_STATUS.ARCHIVED;

  const fromApproval = mapApprovalToBudgetStatus(budget.approval_status);

  if (fromStatus === BUDGET_STATUS.ARCHIVED) return BUDGET_STATUS.ARCHIVED;

  if (fromApproval) {
    if (fromStatus === BUDGET_STATUS.APPROVED && fromApproval === BUDGET_STATUS.SUBMITTED) {
      return BUDGET_STATUS.APPROVED;
    }
    if (
      fromStatus === BUDGET_STATUS.DRAFT ||
      !fromStatus ||
      fromStatus === 'current' ||
      fromApproval === BUDGET_STATUS.REJECTED ||
      fromApproval === BUDGET_STATUS.SUBMITTED ||
      fromApproval === BUDGET_STATUS.APPROVED ||
      fromApproval === BUDGET_STATUS.PAID ||
      fromApproval === BUDGET_STATUS.RECEIVED
    ) {
      if (fromStatus === BUDGET_STATUS.APPROVED && fromApproval === BUDGET_STATUS.DRAFT) {
        return BUDGET_STATUS.APPROVED;
      }
      return fromApproval;
    }
  }

  if (Object.values(BUDGET_STATUS).includes(fromStatus)) return fromStatus;
  return BUDGET_STATUS.DRAFT;
}

export function budgetStatusBadge(budgetOrStatus) {
  if (budgetOrStatus && typeof budgetOrStatus === 'object') {
    const approval = String(budgetOrStatus.approval_status || '').toUpperCase();
    if (approval.startsWith('CLARIFY-')) {
      return { label: 'Clarification Requested', class: 'badge-warning', status: BUDGET_STATUS.SUBMITTED };
    }
    if (approval === 'SUBMITTED') {
      return { label: 'Awaiting OPH Approval', class: 'badge-info', status: BUDGET_STATUS.SUBMITTED };
    }
    if (approval === 'OPH-REVIEWED' || approval === 'OPH-APPROVED') {
      return { label: 'Awaiting FIN Approval', class: 'badge-info', status: BUDGET_STATUS.SUBMITTED };
    }
    if (approval === 'FIN-REVIEWED' || approval === 'FIN-APPROVED') {
      return { label: 'Awaiting FIH Approval', class: 'badge-info', status: BUDGET_STATUS.SUBMITTED };
    }
    if (approval === 'FIH-REVIEWED' || approval === 'FIH-APPROVED') {
      return { label: 'Awaiting CAO Approval', class: 'badge-info', status: BUDGET_STATUS.SUBMITTED };
    }
    if (approval === 'CAO-REVIEWED' || approval === 'CAO-APPROVED') {
      return { label: 'Awaiting Payment', class: 'badge-info', status: BUDGET_STATUS.APPROVED };
    }
    if (approval === 'FIP-APPROVED' || approval === 'PAID') {
      return { label: 'Paid', class: 'badge-success', status: BUDGET_STATUS.PAID };
    }
    if (approval === 'RECEIVED') {
      return { label: 'Received', class: 'badge-success', status: BUDGET_STATUS.RECEIVED };
    }
  }
  const status = typeof budgetOrStatus === 'string'
    ? budgetOrStatus
    : getBudgetStatus(budgetOrStatus);
  const label = BUDGET_STATUS_LABELS[status] || status;
  if (status === BUDGET_STATUS.DRAFT) return { label, class: 'badge-secondary', status };
  if (status === BUDGET_STATUS.SUBMITTED) return { label, class: 'badge-info', status };
  if (status === BUDGET_STATUS.REJECTED) return { label, class: 'badge-danger', status };
  if (status === BUDGET_STATUS.APPROVED) return { label, class: 'badge-success', status };
  if (status === BUDGET_STATUS.PAID) return { label, class: 'badge-info', status };
  if (status === BUDGET_STATUS.RECEIVED) return { label, class: 'badge-success', status };
  if (status === BUDGET_STATUS.ARCHIVED) return { label, class: 'badge-secondary', status };
  return { label, class: 'badge-secondary', status };
}

export function budgetStatusBadgeHtml(budgetOrStatus) {
  const badge = budgetStatusBadge(budgetOrStatus);
  return `<span class="badge ${badge.class}">${badge.label}</span>`;
}

/** Amounts / categories editable: draft or rejected (or SYS always). */
export function canEditBudgetLines(budget) {
  if (isSystemAdmin()) return true;
  if (!state.canEditBudgets) return false;
  const status = getBudgetStatus(budget);
  const isClarify = String(budget?.approval_status || '').toUpperCase() === 'CLARIFY-OPL';
  return status === BUDGET_STATUS.DRAFT || status === BUDGET_STATUS.REJECTED || isClarify;
}

/** Open the editor at all (view + maybe archive). */
export function canOpenBudgetEditor(budget) {
  if (isSystemAdmin()) return true;
  if (!state.canEditBudgets) return false;
  return true;
}

/** Team lead / admin may archive approved budgets. */
export function canArchiveBudget(budget) {
  if (isSystemAdmin()) return true;
  if (!state.canEditBudgets) return false;
  return getBudgetStatus(budget) === BUDGET_STATUS.APPROVED;
}

export function isApprovedBudget(budget) {
  return getBudgetStatus(budget) === BUDGET_STATUS.APPROVED;
}

export function isArchivedBudget(budget) {
  return getBudgetStatus(budget) === BUDGET_STATUS.ARCHIVED;
}

/** Statuses that may be submitted for approval. */
export function canSubmitBudgetByStatus(budget) {
  const status = getBudgetStatus(budget);
  return status === BUDGET_STATUS.DRAFT || status === BUDGET_STATUS.REJECTED;
}

export function budgetStatusOptionsHtml(selected, { forCreate = false, allowArchive = false } = {}) {
  const sel = getBudgetStatus({ status: selected });
  if (forCreate) {
    return `<option value="draft" selected>Draft</option>`;
  }

  const all = [
    { value: BUDGET_STATUS.DRAFT, label: 'Draft' },
    { value: BUDGET_STATUS.SUBMITTED, label: 'Submitted' },
    { value: BUDGET_STATUS.REJECTED, label: 'Rejected' },
    { value: BUDGET_STATUS.APPROVED, label: 'Approved' },
    { value: BUDGET_STATUS.ARCHIVED, label: 'Archived' }
  ];

  const sys = isSystemAdmin();
  let allowed;
  if (sys) {
    allowed = all;
  } else if (sel === BUDGET_STATUS.APPROVED) {
    allowed = all.filter(o => o.value === BUDGET_STATUS.APPROVED || (allowArchive && o.value === BUDGET_STATUS.ARCHIVED));
  } else if (sel === BUDGET_STATUS.SUBMITTED || sel === BUDGET_STATUS.ARCHIVED) {
    allowed = all.filter(o => o.value === sel);
  } else {
    // draft or rejected — editable workflow
    allowed = all.filter(o => o.value === BUDGET_STATUS.DRAFT || o.value === BUDGET_STATUS.REJECTED);
  }

  if (!allowed.some(o => o.value === sel)) {
    allowed = [{ value: sel, label: BUDGET_STATUS_LABELS[sel] || sel }, ...allowed];
  }

  return allowed
    .map(o => `<option value="${o.value}" ${o.value === sel ? 'selected' : ''}>${o.label}</option>`)
    .join('');
}
