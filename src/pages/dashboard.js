// ==================== DASHBOARD PAGE ====================
import { state } from '../state.js';
import { supabaseClient } from '../db.js';
import {
  findNextCalendarEntry,
  monthlyBudgetExistsForEntry,
  getSubmissionStatus,
  getDailyReconciliationStatus,
  formatDisplayDate,
  todayDateStr
} from '../utils/budgetCalendar.js';
import { sumBucketBalancesToUsd, formatUsdDisplay } from '../utils/currency.js';
import {
  computeBucketStatusRow,
  filterBucketsByScope,
  bucketHasMoney
} from '../utils/financialStatusHelpers.js';
import {
  fetchPendingTransfersForUser
} from '../utils/transferActions.js';
import {
  acceptTransferFromDashboard,
  rejectTransferFromDashboard
} from './transfer.js';

function formatUsd(amount) {
  return '$' + formatUsdDisplay(amount);
}

export function getDashboardPage() {
  const teamName = state.currentTeam?.team_name || 'your team';
  const userName = state.user?.name || 'User';

  return `
    <h1 class="page-title">Dashboard</h1>
    <p class="dash-welcome">Welcome, ${userName} — ${teamName}</p>

    <div class="stats-grid dash-stats">
      <div class="stat-card stat-card--info">
        <h3 id="dashBalance">—</h3>
        <p id="dashBalanceLabel">Team balance (USD)</p>
      </div>
      <div class="stat-card stat-card--income">
        <h3 id="dashIncome">—</h3>
        <p>Income (allocated)</p>
      </div>
      <div class="stat-card stat-card--expense">
        <h3 id="dashExpenses">—</h3>
        <p>Expenses</p>
      </div>
      <div class="stat-card stat-card--gold" id="dashSubmissionCard">
        <h3 id="dashNextSubmission">—</h3>
        <p id="dashSubmissionLabel">Next Budget Submission</p>
      </div>
    </div>

    <div class="card dash-alerts-card">
      <h2>Alerts</h2>
      <div id="dashAlerts" class="dash-alerts">
        <p class="dash-alerts-loading">Loading alerts…</p>
      </div>
    </div>
  `;
}

export async function initDashboardPage() {
  const teamId = state.currentTeam?.team_id;
  if (!teamId) return;

  window.acceptDashboardTransfer = async (transferId) => {
    const ok = await acceptTransferFromDashboard(transferId);
    if (ok) await initDashboardPage();
  };
  window.rejectDashboardTransfer = async (transferId) => {
    const ok = await rejectTransferFromDashboard(transferId);
    if (ok) await initDashboardPage();
  };

  const today = todayDateStr();

  try {
    const [
      bucketsRes,
      budgetsRes,
      incomeRes,
      expensesRes,
      calendarRes,
      reconSubmissionsRes,
      ratesRes,
      transfersRes
    ] = await Promise.all([
      supabaseClient.from('buckets').select('*').eq('team_id', teamId).eq('is_deleted', false),
      supabaseClient.from('budget_plans').select('id, status, budget_type, calendar_entry_id, budget_period_date').eq('team_id', teamId).eq('is_deleted', false),
      supabaseClient.from('income').select('amount_usd, budget_allocations, bucket_id, local_amount, currency, date, is_deleted').eq('team_id', teamId).eq('is_deleted', false),
      supabaseClient.from('expenses').select('budget_id, usd_amount, bucket_id, local_amount, currency, date, is_deleted').eq('team_id', teamId).eq('is_deleted', false),
      supabaseClient.from('budget_calendar_entries').select('*').eq('is_deleted', false).order('submission_deadline'),
      supabaseClient.from('reconciliation_submissions').select('scope, user_id, reconciliation_date').eq('team_id', teamId).eq('is_deleted', false).eq('reconciliation_date', today),
      supabaseClient.from('exchange_rates').select('*').eq('team_id', teamId).eq('is_deleted', false).order('date', { ascending: false }),
      supabaseClient.from('transfers').select('*').eq('team_id', teamId).eq('is_deleted', false)
    ]);

    const buckets = bucketsRes.data || [];
    const rates = ratesRes.data || [];
    const budgets = budgetsRes.data || [];
    const income = incomeRes.data || [];
    const expenses = expensesRes.data || [];
    const calendarEntries = calendarRes.error ? [] : (calendarRes.data || []);
    const reconSubmissions = reconSubmissionsRes.error ? [] : (reconSubmissionsRes.data || []);
    const transfers = transfersRes.data || [];

    const teamBuckets = filterBucketsByScope(buckets, 'team');
    const { totalUsd: totalBalanceUsd, missingRates, missingCurrency, breakdown } = sumBucketBalancesToUsd(teamBuckets, rates);
    const hasForeignBuckets = teamBuckets.some(b => String(b.currency || '').trim() && b.currency !== 'USD');

    const balanceEl = document.getElementById('dashBalance');
    const balanceLabel = document.getElementById('dashBalanceLabel');
    if (balanceEl) {
      balanceEl.textContent = formatUsd(totalBalanceUsd);
      const titleParts = breakdown.length ? [breakdown.join('\n')] : [];
      if (missingRates.length) {
        titleParts.push(`Excluded (no rate): ${missingRates.join(', ')}`);
      }
      if (missingCurrency.length) {
        titleParts.push(`Excluded (currency not set): ${missingCurrency.join(', ')}`);
      }
      balanceEl.title = titleParts.join('\n\n') || 'Team operational bucket balances';
    }
    if (balanceLabel) {
      balanceLabel.textContent = hasForeignBuckets
        ? 'Team balance (USD equiv.)'
        : 'Team balance (USD)';
    }

    const currentBudgets = budgets.filter(b => {
      const s = String(b.status || '').toLowerCase();
      return s === 'approved' || s === 'current';
    });
    const currentBudgetIds = new Set(currentBudgets.map(b => b.id));

    let allocatedIncome = 0;
    income.forEach(rec => {
      (rec.budget_allocations || []).forEach(a => {
        if (currentBudgetIds.has(a.budget_id)) {
          allocatedIncome += parseFloat(a.amount_usd) || 0;
        }
      });
    });
    const incomeEl = document.getElementById('dashIncome');
    if (incomeEl) incomeEl.textContent = formatUsd(allocatedIncome);

    const totalExpenses = expenses
      .filter(e => currentBudgetIds.has(e.budget_id))
      .reduce((sum, e) => sum + (parseFloat(e.usd_amount) || 0), 0);
    const expensesEl = document.getElementById('dashExpenses');
    if (expensesEl) expensesEl.textContent = formatUsd(totalExpenses);

    const currentEntry = findNextCalendarEntry(calendarEntries, today);
    const hasMonthlyForCurrent = monthlyBudgetExistsForEntry(budgets, currentEntry);
    const submissionStatus = getSubmissionStatus(currentEntry, hasMonthlyForCurrent, today);

    const nextEl = document.getElementById('dashNextSubmission');
    const submissionCard = document.getElementById('dashSubmissionCard');
    const submissionLabel = document.getElementById('dashSubmissionLabel');

    if (submissionCard) {
      submissionCard.classList.remove('stat-card--gold', 'stat-card--success', 'stat-card--danger');
    }

    if (nextEl) {
      if (!currentEntry) {
        nextEl.textContent = '—';
        nextEl.title = 'No calendar configured';
        if (submissionLabel) submissionLabel.textContent = 'Next Budget Submission';
        if (submissionCard) submissionCard.classList.add('stat-card--gold');
      } else if (hasMonthlyForCurrent) {
        nextEl.textContent = formatDisplayDate(currentEntry.submission_deadline);
        nextEl.title = `Submitted for ${formatDisplayDate(currentEntry.budget_period_date)}`;
        if (submissionLabel) {
          submissionLabel.textContent = `Submitted — ${formatDisplayDate(currentEntry.budget_period_date)}`;
        }
        if (submissionCard) submissionCard.classList.add('stat-card--success');
      } else if (submissionStatus.isOverdue) {
        const delay = Math.abs(submissionStatus.days);
        nextEl.textContent = delay === 1 ? 'Delayed 1 day' : `Delayed ${delay} days`;
        nextEl.title = `Was due ${formatDisplayDate(currentEntry.submission_deadline)}`;
        if (submissionLabel) {
          submissionLabel.textContent = `Due ${formatDisplayDate(currentEntry.submission_deadline)}`;
        }
        if (submissionCard) submissionCard.classList.add('stat-card--danger');
      } else if (submissionStatus.days === 0) {
        nextEl.textContent = 'Due today';
        nextEl.title = `Submit by ${formatDisplayDate(currentEntry.submission_deadline)}`;
        if (submissionLabel) {
          submissionLabel.textContent = `Due ${formatDisplayDate(currentEntry.submission_deadline)}`;
        }
        if (submissionCard) submissionCard.classList.add('stat-card--danger');
      } else {
        nextEl.textContent = `${submissionStatus.days}d`;
        nextEl.title = `Submit by ${formatDisplayDate(currentEntry.submission_deadline)}`;
        if (submissionLabel) {
          submissionLabel.textContent = `Due ${formatDisplayDate(currentEntry.submission_deadline)}`;
        }
        if (submissionCard) submissionCard.classList.add('stat-card--gold');
      }
    }

    const alerts = [];

    // Pending transfers awaiting this user's confirmation
    try {
      const pendingTransfers = await fetchPendingTransfersForUser(teamId, state.user?.id);
      const { data: bucketList } = await supabaseClient
        .from('buckets')
        .select('id, name')
        .eq('team_id', teamId)
        .eq('is_deleted', false);
      const bucketName = Object.fromEntries((bucketList || []).map(b => [b.id, b.name]));

      pendingTransfers.forEach(t => {
        const fromName = bucketName[t.from_bucket_id] || 'Source';
        const amount = parseFloat(t.amount) || 0;
        const isOhf = t.pending_step === 'ohf';
        alerts.unshift({
          level: 'warning',
          icon: isOhf ? '✅' : '💸',
          title: isOhf ? 'Approve cross-team transfer' : 'Confirm money received',
          message: `${amount.toFixed(2)} ${t.currency || ''} from ${fromName} — ${t.description || ''}`,
          transferId: t.id,
          isTransfer: true,
          transferIsOhf: isOhf
        });
      });
    } catch (pendingErr) {
      console.warn('Pending transfers load:', pendingErr);
    }

    if (currentEntry && !hasMonthlyForCurrent) {
      alerts.push({
        level: 'danger',
        icon: '📋',
        title: 'Monthly budget due',
        message: submissionStatus.message,
        action: { page: 'create-budget', label: 'Create budget' }
      });
    }

    const totalReceived = income.reduce((sum, r) => sum + (parseFloat(r.amount_usd) || 0), 0);
    const remaining = totalReceived - totalExpenses;
    if (totalReceived > 0 && remaining / totalReceived < 0.25) {
      const pct = Math.round((remaining / totalReceived) * 100);
      alerts.push({
        level: 'danger',
        icon: '💰',
        title: 'Low balance',
        message: `Only ${pct}% of received funds remain (${formatUsd(remaining)} of ${formatUsd(totalReceived)})`,
        action: { page: 'income-manager', label: 'View income' }
      });
    }

    const reconRequired = filterBucketsByScope(buckets, 'all').some(b => bucketHasMoney(
      computeBucketStatusRow(b, today, today, income, expenses, transfers, buckets, rates)
    ));
    const submittedToday = reconSubmissions.some(s => s.scope === 'all' || s.scope === 'team');
    const reconStatus = getDailyReconciliationStatus({
      submittedToday,
      required: reconRequired
    }, today);

    alerts.push({
      level: reconStatus.level,
      icon: '📊',
      title: 'Daily reconciliation',
      message: reconStatus.message,
      action: { page: 'financial-status', label: 'Financial status' }
    });

    if (alerts.length === 0) {
      alerts.push({ level: 'success', icon: '✓', title: 'All clear', message: 'No alerts at this time' });
    }

    renderAlerts(alerts);
  } catch (e) {
    console.error('Dashboard load error:', e);
    const alertsEl = document.getElementById('dashAlerts');
    if (alertsEl) {
      alertsEl.innerHTML = `<div class="dash-alert dash-alert--danger"><strong>Error loading dashboard</strong><span>${e.message}</span></div>`;
    }
  }
}

function renderAlerts(alerts) {
  const container = document.getElementById('dashAlerts');
  if (!container) return;

  container.innerHTML = alerts.map(a => `
    <div class="dash-alert dash-alert--${a.level}">
      <div class="dash-alert-icon" aria-hidden="true">${a.icon}</div>
      <div class="dash-alert-body">
        <strong>${a.title}</strong>
        <span>${a.message}</span>
      </div>
      ${a.isTransfer ? `
        <div class="dash-alert-actions">
          <button type="button" class="dash-alert-action dash-alert-action--accept" onclick="window.acceptDashboardTransfer('${a.transferId}')">${a.transferIsOhf ? 'Approve' : 'Accept'}</button>
          <button type="button" class="dash-alert-action dash-alert-action--reject" onclick="window.rejectDashboardTransfer('${a.transferId}')">Reject</button>
        </div>
      ` : ''}
      ${a.action && !a.isTransfer ? `<button type="button" class="dash-alert-action" onclick="window.showPage('${a.action.page}')">${a.action.label}</button>` : ''}
    </div>
  `).join('');
}
