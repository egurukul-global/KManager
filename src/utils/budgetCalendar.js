// ==================== BUDGET CALENDAR HELPERS ====================

export const CALENDAR_STATUS_OPEN = 'open';
export const CALENDAR_STATUS_CLOSED = 'closed';

/** Only open calendar periods can be used for monthly budget creation. */
export function isCalendarEntryOpen(entry) {
  if (!entry || entry.is_deleted) return false;
  const status = entry.status ?? CALENDAR_STATUS_OPEN;
  return status === CALENDAR_STATUS_OPEN;
}

export function getCalendarStatusLabel(status) {
  return status === CALENDAR_STATUS_CLOSED ? 'Closed' : 'Open';
}

export function filterOpenCalendarEntries(entries) {
  return (entries || []).filter(isCalendarEntryOpen);
}

/** Submission deadline = budget period date minus 10 days */
export function computeSubmissionDeadline(budgetPeriodDate) {
  const d = new Date(budgetPeriodDate + 'T12:00:00');
  d.setDate(d.getDate() - 10);
  return d.toISOString().split('T')[0];
}

export function parseDateOnly(dateStr) {
  return new Date(dateStr + 'T12:00:00');
}

export function daysBetween(fromDateStr, toDateStr) {
  const from = parseDateOnly(fromDateStr);
  const to = parseDateOnly(toDateStr);
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

export function todayDateStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Next relevant open calendar entry: upcoming submission deadline or most recent overdue */
export function findNextCalendarEntry(entries, today = todayDateStr()) {
  const active = filterOpenCalendarEntries(entries)
    .sort((a, b) => a.submission_deadline.localeCompare(b.submission_deadline));

  if (active.length === 0) return null;

  const overdueOrToday = active.filter(e => e.submission_deadline <= today);
  if (overdueOrToday.length > 0) return overdueOrToday[overdueOrToday.length - 1];

  return active.find(e => e.submission_deadline > today) || active[active.length - 1];
}

export function monthlyBudgetExistsForEntry(budgets, entry) {
  if (!entry) return false;
  return (budgets || []).some(b =>
    b.budget_type === 'monthly' &&
    b.status !== 'archive' &&
    b.status !== 'archived' &&
    (b.calendar_entry_id === entry.id ||
      b.budget_period_date === entry.budget_period_date)
  );
}

/** Earliest open calendar period that still needs a monthly budget — uses current period, not ancient backlog. */
export function findOutstandingCalendarEntry(entries, budgets, today = todayDateStr()) {
  const current = findNextCalendarEntry(entries, today);
  if (current && !monthlyBudgetExistsForEntry(budgets, current)) {
    return current;
  }
  return null;
}

export function getSubmissionStatus(entry, hasMonthlyBudget, today = todayDateStr()) {
  if (!entry) {
    return { level: 'neutral', message: 'No calendar configured', days: null };
  }

  const deadline = entry.submission_deadline;
  const daysUntil = daysBetween(today, deadline);

  if (hasMonthlyBudget) {
    return {
      level: 'success',
      message: `Submitted for ${formatDisplayDate(entry.budget_period_date)}`,
      days: daysUntil,
      isOverdue: false,
      isMissing: false
    };
  }

  if (daysUntil >= 0) {
    return {
      level: 'danger',
      message: daysUntil === 0 ? 'Budget due — submit today' : `Budget due — due in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`,
      days: daysUntil,
      isOverdue: false,
      isMissing: true
    };
  }

  const delayDays = Math.abs(daysUntil);
  return {
    level: 'danger',
    message: `Budget due — delay by ${delayDays} day${delayDays === 1 ? '' : 's'}`,
    days: daysUntil,
    isOverdue: true,
    isMissing: true
  };
}

export function formatDisplayDate(dateStr) {
  if (!dateStr) return '—';
  const d = parseDateOnly(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Legacy manual name pattern e.g. 2026-07-17-CN — use calendar labels for monthly budgets instead. */
export function isDateCnBudgetName(name) {
  return /^\d{4}-\d{2}-\d{2}-CN$/i.test(String(name || '').trim());
}

export const DATE_CN_BUDGET_NAME_WARNING =
  'Names like yyyy-mm-dd-CN are discouraged. For monthly budgets, pick a calendar date and use its label so all teams share the same name. You can keep this name or change it later when editing the budget.';

export function getReconciliationStatus(lastDateStr, today = todayDateStr()) {
  if (!lastDateStr) {
    return { level: 'danger', message: 'Not reconciled', daysSince: null };
  }

  const daysSince = daysBetween(lastDateStr, today);

  if (daysSince <= 1) {
    return { level: 'success', message: daysSince === 0 ? 'Done today' : 'Done yesterday', daysSince };
  }
  if (daysSince <= 3) {
    return { level: 'warning', message: `${daysSince} days since last`, daysSince };
  }
  return { level: 'danger', message: `${daysSince} days since last`, daysSince };
}

/** Daily reconciliation — one submission per team per day when buckets hold funds. */
export function getDailyReconciliationStatus({ submittedToday, required }, today = todayDateStr()) {
  if (!required) {
    return { level: 'neutral', message: 'No buckets requiring reconciliation', submittedToday: true };
  }
  if (submittedToday) {
    return { level: 'success', message: 'Submitted today', submittedToday: true, today };
  }
  return {
    level: 'danger',
    message: 'Daily reconciliation not submitted today',
    submittedToday: false,
    today
  };
}
