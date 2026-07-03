// ==================== DASHBOARD PAGE ====================
import { state } from '../state.js';
import { supabaseClient } from '../db.js';
<<<<<<< Updated upstream
=======
import {
  findNextCalendarEntry,
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

function formatUsd(amount) {
  return '$' + formatUsdDisplay(amount);
}
>>>>>>> Stashed changes

export function getDashboardPage() {
  return `
    <h1 class="page-title">Dashboard</h1>
    <div class="stats-grid">
      <div class="stat-card">
        <h3 id="dashTeamName">${state.currentTeam?.team_name || 'No Team'}</h3>
        <p>Current Team</p>
      </div>
      <div class="stat-card" style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%);">
        <h3 id="dashBucketCount">-</h3>
        <p>Money Buckets</p>
      </div>
      <div class="stat-card" style="background: linear-gradient(135deg, #ffc107 0%, #ff9800 100%);">
        <h3 id="dashBudgetCount">-</h3>
        <p>Active Budgets</p>
      </div>
      <div class="stat-card" style="background: linear-gradient(135deg, #17a2b8 0%, #138496 100%);">
        <h3 id="dashCategoryCount">-</h3>
        <p>Categories</p>
      </div>
    </div>
    <div class="card">
      <h2>👋 Welcome, ${state.user?.name || 'User'}!</h2>
      <p style="color: #666; line-height: 1.6;">
        You are viewing data for <strong>${state.currentTeam?.team_name || 'your team'}</strong>. 
        Use the team switcher in the sidebar to change context.<br><br>
        Your access level: <strong>${(state.userTeamAccess?.access_level || 'member').toUpperCase()}</strong>
      </p>
    </div>
    <div class="card">
      <h2>📊 Quick Stats</h2>
      <div class="stats-grid" style="margin-top: 15px;">
        <div class="stat-card" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
          <h3 id="dashExpenseCount">-</h3>
          <p>This Month's Expenses</p>
        </div>
        <div class="stat-card" style="background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);">
          <h3 id="dashIncomeCount">-</h3>
          <p>This Month's Income</p>
        </div>
      </div>
    </div>
  `;
}

export async function initDashboardPage() {
  try {
<<<<<<< Updated upstream
    const teamId = state.currentTeam?.team_id;
    if (!teamId) return;

    // Count buckets
    const { count: bucketCount } = await supabaseClient
      .from('buckets')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .eq('is_deleted', false);
    const bucketEl = document.getElementById('dashBucketCount');
    if (bucketEl) bucketEl.textContent = bucketCount || 0;
=======
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
>>>>>>> Stashed changes

    // Count active budgets
    const { count: budgetCount } = await supabaseClient
      .from('budget_plans')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .in('status', ['draft', 'current'])
      .eq('is_deleted', false);
    const budgetEl = document.getElementById('dashBudgetCount');
    if (budgetEl) budgetEl.textContent = budgetCount || 0;

    // Count categories
    const { count: catCount } = await supabaseClient
      .from('categories')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .eq('is_deleted', false);
    const catEl = document.getElementById('dashCategoryCount');
    if (catEl) catEl.textContent = catCount || 0;

    // Count this month's expenses
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const { count: expenseCount } = await supabaseClient
      .from('expenses')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .gte('date', startOfMonth);
    const expEl = document.getElementById('dashExpenseCount');
    if (expEl) expEl.textContent = expenseCount || 0;

<<<<<<< Updated upstream
    // Count this month's income
    const { count: incomeCount } = await supabaseClient
      .from('income')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .gte('date', startOfMonth);
    const incEl = document.getElementById('dashIncomeCount');
    if (incEl) incEl.textContent = incomeCount || 0;

=======
    const totalExpenses = expenses
      .filter(e => currentBudgetIds.has(e.budget_id))
      .reduce((sum, e) => sum + (parseFloat(e.usd_amount) || 0), 0);
    const expensesEl = document.getElementById('dashExpenses');
    if (expensesEl) expensesEl.textContent = formatUsd(totalExpenses);

    const nextEntry = findNextCalendarEntry(calendarEntries, today);
    const hasMonthlyForNext = nextEntry
      ? budgets.some(b =>
          b.budget_type === 'monthly' &&
          b.status !== 'archive' &&
          (b.calendar_entry_id === nextEntry.id ||
            b.budget_period_date === nextEntry.budget_period_date))
      : false;

    const submissionStatus = getSubmissionStatus(nextEntry, hasMonthlyForNext, today);
    const nextEl = document.getElementById('dashNextSubmission');
    if (nextEl) {
      if (!nextEntry) {
        nextEl.textContent = '—';
        nextEl.title = 'No calendar configured';
      } else if (hasMonthlyForNext) {
        nextEl.textContent = formatDisplayDate(nextEntry.submission_deadline);
        nextEl.title = `Submitted for ${formatDisplayDate(nextEntry.budget_period_date)}`;
      } else if (submissionStatus.days !== null && submissionStatus.days >= 0) {
        nextEl.textContent = submissionStatus.days === 0 ? 'Today' : `${submissionStatus.days}d`;
        nextEl.title = `Submit by ${formatDisplayDate(nextEntry.submission_deadline)}`;
      } else {
        const delay = Math.abs(submissionStatus.days);
        nextEl.textContent = `+${delay}d late`;
        nextEl.title = `Was due ${formatDisplayDate(nextEntry.submission_deadline)}`;
      }
    }

    const alerts = [];

    if (nextEntry && !hasMonthlyForNext) {
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
>>>>>>> Stashed changes
  } catch (e) {
    console.error('Dashboard load error:', e);
  }
}
