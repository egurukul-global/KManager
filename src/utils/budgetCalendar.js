// ==================== BUDGET CALENDAR HELPERS ====================

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
  return new Date().toISOString().split('T')[0];
}

/** Next relevant calendar entry: upcoming submission deadline or most recent overdue */
export function findNextCalendarEntry(entries, today = todayDateStr()) {
  const active = (entries || [])
    .filter(e => !e.is_deleted)
    .sort((a, b) => a.submission_deadline.localeCompare(b.submission_deadline));

  if (active.length === 0) return null;

  const upcoming = active.find(e => e.submission_deadline >= today);
  if (upcoming) return upcoming;

  return active[active.length - 1];
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
