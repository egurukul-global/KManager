// ==================== EXPENSE REPORTS ====================
import { state } from '../state.js';
import { sbSelect } from '../db.js';
import { showToast } from '../components/toasts.js';
import { getExpenseCategoryLabel } from '../utils/expenseHelpers.js';
import { formatUsdDisplay } from '../utils/currency.js';

let teamBuckets = [];
let teamBudgets = [];
let teamCategories = [];
let teamExpenses = [];

function parseBudgetCategories(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function normalizeBudget(budget) {
  return { ...budget, categories: parseBudgetCategories(budget.categories) };
}

function getBucketName(bucketId) {
  return teamBuckets.find(b => b.id === bucketId)?.name || '—';
}

function getBudgetName(budgetId) {
  return teamBudgets.find(b => b.id === budgetId)?.name || 'Unknown';
}

export function getExpenseReportsPage() {
  return `
    <h1 class="page-title">Reports</h1>
    <div class="card">
      <h2>Filter & Generate Report</h2>
      <div class="filter-section">
        <div class="form-grid">
          <div class="form-group"><label>Start Date</label><input type="date" id="reportStart"></div>
          <div class="form-group"><label>End Date</label><input type="date" id="reportEnd"></div>
          <div class="form-group">
            <label>Budget</label>
            <select id="reportBudget" onchange="window.onReportBudgetChange()">
              <option value="">All Budgets</option>
            </select>
          </div>
          <div class="form-group">
            <label>Category</label>
            <select id="reportCategory"><option value="">All Categories</option></select>
          </div>
          <div class="form-group">
            <label>Payment Source</label>
            <select id="reportSource"><option value="">All Sources</option></select>
          </div>
          <div class="form-group">
            <label>Currency</label>
            <select id="reportCurrency"><option value="">All Currencies</option></select>
          </div>
        </div>
        <div class="btn-group">
          <button type="button" onclick="window.generateExpenseReport()">Generate Report</button>
          <button type="button" class="secondary" onclick="window.resetExpenseReportFilters()">Reset</button>
        </div>
      </div>
      <div id="expenseReportResults"></div>
    </div>
  `;
}

export async function initExpenseReportsPage() {
  window.generateExpenseReport = generateExpenseReport;
  window.resetExpenseReportFilters = resetExpenseReportFilters;
  window.onReportBudgetChange = onReportBudgetChange;

  const teamId = state.currentTeam?.team_id;
  if (!teamId) return;

  try {
    const [bucketsRes, budgetsRes, categoriesRes, expensesRes] = await Promise.all([
      sbSelect('buckets', { teamId, orderBy: 'name', ascending: true }),
      sbSelect('budget_plans', { teamId, orderBy: 'name', ascending: true }),
      sbSelect('categories', { teamId, orderBy: 'name', ascending: true }),
      sbSelect('expenses', { teamId, orderBy: 'date', ascending: false })
    ]);

    teamBuckets = (bucketsRes.data || []).filter(b => !b.is_deleted);
    teamBudgets = (budgetsRes.data || []).filter(b => !b.is_deleted).map(normalizeBudget);
    teamCategories = (categoriesRes.data || []).filter(c => !c.is_deleted);
    teamExpenses = (expensesRes.data || []).filter(e => !e.is_deleted);

    populateReportFilters();
  } catch (err) {
    console.error('Init expense reports error:', err);
    showToast('Failed to load report data', 'error');
  }
}

function populateReportFilters() {
  const budgetSelect = document.getElementById('reportBudget');
  if (budgetSelect) {
    budgetSelect.innerHTML = '<option value="">All Budgets</option>';
    teamBudgets.forEach(b => {
      budgetSelect.innerHTML += `<option value="${b.id}">${b.name}</option>`;
    });
  }

  const sourceSelect = document.getElementById('reportSource');
  if (sourceSelect) {
    sourceSelect.innerHTML = '<option value="">All Sources</option>';
    teamBuckets.forEach(b => {
      sourceSelect.innerHTML += `<option value="${b.id}">${b.name}</option>`;
    });
  }

  const currSelect = document.getElementById('reportCurrency');
  if (currSelect) {
    const currencies = [...new Set(teamBuckets.map(b => b.currency).filter(Boolean))].sort();
    currSelect.innerHTML = '<option value="">All Currencies</option>';
    currencies.forEach(c => {
      currSelect.innerHTML += `<option value="${c}">${c}</option>`;
    });
  }

  populateReportCategories();
}

function populateReportCategories() {
  const budgetId = document.getElementById('reportBudget')?.value;
  const catSelect = document.getElementById('reportCategory');
  if (!catSelect) return;

  catSelect.innerHTML = '<option value="">All Categories</option>';

  if (!budgetId) {
    const names = new Set();
    teamBudgets.forEach(b => (b.categories || []).forEach(c => names.add(c.category || c.name)));
    [...names].sort().forEach(name => {
      catSelect.innerHTML += `<option value="${name}">${name}</option>`;
    });
    return;
  }

  const budget = teamBudgets.find(b => b.id === budgetId);
  (budget?.categories || []).forEach(c => {
    const name = c.category || c.name;
    catSelect.innerHTML += `<option value="${name}">${name}</option>`;
  });
}

function onReportBudgetChange() {
  populateReportCategories();
  const results = document.getElementById('expenseReportResults');
  if (results) results.innerHTML = '';
}

function resetExpenseReportFilters() {
  ['reportStart', 'reportEnd'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  ['reportBudget', 'reportCategory', 'reportSource', 'reportCurrency'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  populateReportCategories();
  const results = document.getElementById('expenseReportResults');
  if (results) results.innerHTML = '';
}

function filterExpenses(filters) {
  const { start, end, budgetId, category, sourceId, currency } = filters;

  return teamExpenses.filter(e => {
    if (start && e.date < start) return false;
    if (end && e.date > end) return false;
    if (budgetId && e.budget_id !== budgetId) return false;
    if (sourceId && e.bucket_id !== sourceId) return false;
    if (currency && e.currency !== currency) return false;
    if (category) {
      const label = getExpenseCategoryLabel(e, teamCategories);
      if (label !== category) return false;
    }
    return true;
  });
}

function budgetedUsd(budget) {
  return (budget.categories || []).reduce((sum, cat) => {
    return sum + (parseFloat(cat.usdAmount ?? cat.usd_amount) || 0);
  }, 0);
}

function generateExpenseReport() {
  const start = document.getElementById('reportStart')?.value || '';
  const end = document.getElementById('reportEnd')?.value || '';
  const budgetId = document.getElementById('reportBudget')?.value || '';
  const category = document.getElementById('reportCategory')?.value || '';
  const sourceId = document.getElementById('reportSource')?.value || '';
  const currency = document.getElementById('reportCurrency')?.value || '';

  const filtered = filterExpenses({ start, end, budgetId, category, sourceId, currency });
  const container = document.getElementById('expenseReportResults');
  if (!container) return;

  const totalUSD = filtered.reduce((sum, e) => sum + (parseFloat(e.usd_amount) || 0), 0);

  if (!budgetId) {
    container.innerHTML = renderAllBudgetsReport(filtered, totalUSD);
    return;
  }

  const budget = teamBudgets.find(b => b.id === budgetId);
  if (!budget) {
    container.innerHTML = '<div class="empty-state"><p>Budget not found.</p></div>';
    return;
  }

  container.innerHTML = renderSingleBudgetReport(filtered, budget);
}

function renderAllBudgetsReport(filtered, totalUSD) {
  let html = `
    <h3 style="margin-top:20px;">Report Summary</h3>
    <div class="stats-grid" style="margin-bottom:20px;">
      <div class="stat-card"><h3>${filtered.length}</h3><p>Transactions</p></div>
      <div class="stat-card"><h3>$${formatUsdDisplay(totalUSD)}</h3><p>Total Spent (USD)</p></div>
    </div>
  `;

  if (filtered.length === 0) {
    html += '<div class="empty-state"><p>No expenses match the selected filters.</p></div>';
    return html;
  }

  html += `
    <h3>Expense Details</h3>
    <div class="table-container">
      <table class="table-stack-mobile">
        <thead>
          <tr>
            <th>Date</th><th>Item</th><th>Budget</th><th>Category</th><th>Source</th>
            <th>Local Amount</th><th>Rate</th><th>USD</th><th>Receipt</th>
          </tr>
        </thead>
        <tbody>
  `;

  [...filtered].sort((a, b) => b.date.localeCompare(a.date)).forEach(exp => {
    const receiptLink = exp.receipt_url
      ? `<a href="${exp.receipt_url}" class="receipt-link" target="_blank" rel="noopener">View</a>`
      : '—';
    html += `
      <tr>
        <td data-label="Date">${exp.date}</td>
        <td data-label="Item">${exp.item || '—'}</td>
        <td data-label="Budget">${getBudgetName(exp.budget_id)}</td>
        <td data-label="Category">${getExpenseCategoryLabel(exp, teamCategories)}</td>
        <td data-label="Source">${getBucketName(exp.bucket_id)}</td>
        <td data-label="Local">${(exp.local_amount || 0).toLocaleString()} ${exp.currency || ''}</td>
        <td data-label="Rate">${exp.exchange_rate ?? '—'}</td>
        <td data-label="USD">$${(exp.usd_amount || 0).toFixed(2)}</td>
        <td data-label="Receipt">${receiptLink}</td>
      </tr>
    `;
  });

  html += '</tbody></table></div>';

  html += '<h3 style="margin-top:30px;">Budget vs Actual</h3>';
  html += `
    <div class="table-container">
      <table class="table-stack-mobile">
        <thead>
          <tr><th>Budget</th><th>Budgeted (USD)</th><th>Actual (USD)</th><th>Balance (USD)</th><th>Status</th></tr>
        </thead>
        <tbody>
  `;

  let relevantBudgets = [...teamBudgets];
  const category = document.getElementById('reportCategory')?.value;
  const sourceId = document.getElementById('reportSource')?.value;
  const currency = document.getElementById('reportCurrency')?.value;
  if (category || sourceId || currency) {
    const ids = new Set(filtered.map(e => e.budget_id));
    relevantBudgets = teamBudgets.filter(b => ids.has(b.id));
  }

  let grandBudgeted = 0;
  let grandActual = 0;
  let grandBalance = 0;

  relevantBudgets.forEach(budget => {
    const budgeted = budgetedUsd(budget);
    const actual = filtered.filter(e => e.budget_id === budget.id)
      .reduce((sum, e) => sum + (parseFloat(e.usd_amount) || 0), 0);
    const balance = budgeted - actual;
    grandBudgeted += budgeted;
    grandActual += actual;
    grandBalance += balance;
    const over = balance < 0;
    html += `
      <tr>
        <td data-label="Budget"><strong>${budget.name}</strong></td>
        <td data-label="Budgeted">$${budgeted.toFixed(2)}</td>
        <td data-label="Actual">$${actual.toFixed(2)}</td>
        <td data-label="Balance" class="${over ? 'negative' : 'positive'}" style="font-weight:bold;">$${balance.toFixed(2)}</td>
        <td data-label="Status"><span class="badge badge-${over ? 'danger' : 'success'}">${over ? 'Over Budget' : 'On Track'}</span></td>
      </tr>
    `;
  });

  const grandOver = grandBalance < 0;
  html += `
      <tr class="status-total">
        <td data-label="Total"><strong>GRAND TOTAL</strong></td>
        <td data-label="Budgeted"><strong>$${grandBudgeted.toFixed(2)}</strong></td>
        <td data-label="Actual"><strong>$${grandActual.toFixed(2)}</strong></td>
        <td data-label="Balance" class="${grandOver ? 'negative' : 'positive'}"><strong>$${grandBalance.toFixed(2)}</strong></td>
        <td data-label="Status"><span class="badge badge-${grandOver ? 'danger' : 'success'}">${grandOver ? 'Over Budget' : 'On Track'}</span></td>
      </tr>
    </tbody></table></div>
  `;

  return html;
}

function renderSingleBudgetReport(filtered, budget) {
  const totalBudgeted = budgetedUsd(budget);
  const totalActual = filtered.reduce((sum, e) => sum + (parseFloat(e.usd_amount) || 0), 0);
  const balance = totalBudgeted - totalActual;

  let html = `
    <h3 style="margin-top:20px;">${budget.name}</h3>
    <div class="stats-grid" style="margin-bottom:20px;">
      <div class="stat-card"><h3>$${totalBudgeted.toFixed(2)}</h3><p>Budgeted (USD)</p></div>
      <div class="stat-card"><h3>$${totalActual.toFixed(2)}</h3><p>Actual (USD)</p></div>
      <div class="stat-card"><h3 class="${balance < 0 ? 'negative' : 'positive'}">$${balance.toFixed(2)}</h3><p>Remaining</p></div>
    </div>
  `;

  html += `
    <h3>By Category</h3>
    <div class="table-container">
      <table class="table-stack-mobile">
        <thead>
          <tr><th>Category</th><th>Budgeted (USD)</th><th>Actual (USD)</th><th>Balance</th></tr>
        </thead>
        <tbody>
  `;

  (budget.categories || []).forEach(cat => {
    const catName = cat.category || cat.name;
    const catBudgeted = parseFloat(cat.usdAmount ?? cat.usd_amount) || 0;
    const catExpenses = filtered.filter(e => getExpenseCategoryLabel(e, teamCategories) === catName);
    const catActual = catExpenses.reduce((sum, e) => sum + (parseFloat(e.usd_amount) || 0), 0);
    const catBalance = catBudgeted - catActual;
    html += `
      <tr>
        <td data-label="Category">${catName}${cat.subcategory ? ` / ${cat.subcategory}` : ''}</td>
        <td data-label="Budgeted">$${catBudgeted.toFixed(2)}</td>
        <td data-label="Actual">$${catActual.toFixed(2)}</td>
        <td data-label="Balance" class="${catBalance < 0 ? 'negative' : 'positive'}">$${catBalance.toFixed(2)}</td>
      </tr>
    `;
  });

  html += '</tbody></table></div>';

  if (filtered.length > 0) {
    html += `
      <h3 style="margin-top:24px;">Transactions</h3>
      <div class="table-container">
        <table class="table-stack-mobile">
          <thead>
            <tr><th>Date</th><th>Item</th><th>Category</th><th>Source</th><th>Local</th><th>USD</th></tr>
          </thead>
          <tbody>
    `;
    [...filtered].sort((a, b) => b.date.localeCompare(a.date)).forEach(exp => {
      html += `
        <tr>
          <td data-label="Date">${exp.date}</td>
          <td data-label="Item">${exp.item || '—'}</td>
          <td data-label="Category">${getExpenseCategoryLabel(exp, teamCategories)}</td>
          <td data-label="Source">${getBucketName(exp.bucket_id)}</td>
          <td data-label="Local">${(exp.local_amount || 0).toLocaleString()} ${exp.currency || ''}</td>
          <td data-label="USD">$${(exp.usd_amount || 0).toFixed(2)}</td>
        </tr>
      `;
    });
    html += '</tbody></table></div>';
  } else {
    html += '<div class="empty-state" style="margin-top:16px;"><p>No transactions for this budget in the selected period.</p></div>';
  }

  return html;
}
