// ==================== EXPENSE REPORTS ====================
import { state } from '../state.js';
import { sbSelect } from '../db.js';
import { showToast } from '../components/toasts.js';
import { getExpenseCategoryLabel } from '../utils/expenseHelpers.js';
import { formatUsdDisplay } from '../utils/currency.js';
import { exportExpenseReportToPdf } from '../utils/reportPdf.js';

let teamBuckets = [];
let teamBudgets = [];
let teamCategories = [];
let teamExpenses = [];
let teamIncome = [];
let lastReportSnapshot = null;

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

function reportHeader(title, showPdf = true) {
  const pdfBtn = showPdf
    ? `<button type="button" class="pdf-export-btn" onclick="window.exportExpenseReportToPDF()">📄 Export to PDF</button>`
    : '';
  return `
    <div class="report-results-header">
      <h3>${title}</h3>
      ${pdfBtn}
    </div>
  `;
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
  window.exportExpenseReportToPDF = exportReportToPDF;

  const teamId = state.currentTeam?.team_id;
  if (!teamId) return;

  try {
    const [bucketsRes, budgetsRes, categoriesRes, expensesRes, incomeRes] = await Promise.all([
      sbSelect('buckets', { teamId, orderBy: 'name', ascending: true }),
      sbSelect('budget_plans', { teamId, orderBy: 'name', ascending: true }),
      sbSelect('categories', { teamId, orderBy: 'name', ascending: true }),
      sbSelect('expenses', { teamId, orderBy: 'date', ascending: false }),
      sbSelect('income', { teamId, orderBy: 'date', ascending: false })
    ]);

    teamBuckets = (bucketsRes.data || []).filter(b => !b.is_deleted);
    teamBudgets = (budgetsRes.data || []).filter(b => !b.is_deleted).map(normalizeBudget);
    teamCategories = (categoriesRes.data || []).filter(c => !c.is_deleted);
    teamExpenses = (expensesRes.data || []).filter(e => !e.is_deleted);
    teamIncome = (incomeRes.data || []).filter(i => !i.is_deleted);

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
  lastReportSnapshot = null;
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
  lastReportSnapshot = null;
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

function filterIncome(filters) {
  const { start, end, budgetId } = filters;

  return teamIncome.filter(rec => {
    if (start && rec.date < start) return false;
    if (end && rec.date > end) return false;
    if (budgetId) {
      const allocs = rec.budget_allocations || [];
      if (!allocs.some(a => a.budget_id === budgetId)) return false;
    }
    return true;
  });
}

function budgetedUsd(budget) {
  return (budget.categories || []).reduce((sum, cat) => {
    return sum + (parseFloat(cat.usdAmount ?? cat.usd_amount) || 0);
  }, 0);
}

function categoryStatusBadge(budgeted, actual) {
  const balance = budgeted - actual;
  if (balance < 0) return '<span class="badge badge-danger">Over Budget</span>';
  if (actual === 0) return '<span class="badge badge-secondary">No Spend</span>';
  return '<span class="badge badge-success">On Track</span>';
}

function exportReportToPDF() {
  if (!lastReportSnapshot) {
    showToast('Generate a report first, then export to PDF.', 'warning');
    return;
  }
  exportExpenseReportToPdf({
    ...lastReportSnapshot,
    getBucketName,
    getBudgetName
  });
}

function generateExpenseReport() {
  const start = document.getElementById('reportStart')?.value || '';
  const end = document.getElementById('reportEnd')?.value || '';
  const budgetId = document.getElementById('reportBudget')?.value || '';
  const category = document.getElementById('reportCategory')?.value || '';
  const sourceId = document.getElementById('reportSource')?.value || '';
  const currency = document.getElementById('reportCurrency')?.value || '';

  const filters = { start, end, budgetId, category, sourceId, currency };
  const filtered = filterExpenses(filters);
  const filteredIncome = filterIncome(filters);
  const container = document.getElementById('expenseReportResults');
  if (!container) return;

  const totalUSD = filtered.reduce((sum, e) => sum + (parseFloat(e.usd_amount) || 0), 0);
  const budget = budgetId ? teamBudgets.find(b => b.id === budgetId) : null;

  lastReportSnapshot = {
    filteredExpenses: filtered,
    filteredIncome,
    filters,
    budget,
    teamCategories
  };

  if (!budgetId) {
    container.innerHTML = renderAllBudgetsReport(filtered, filteredIncome, totalUSD, filters);
    return;
  }

  if (!budget) {
    container.innerHTML = '<div class="empty-state"><p>Budget not found.</p></div>';
    lastReportSnapshot = null;
    return;
  }

  container.innerHTML = renderSingleBudgetReport(filtered, filteredIncome, budget);
}

function renderIncomeSection(filteredIncome) {
  if (!filteredIncome.length) return '';

  const totalIncomeAmount = filteredIncome.reduce(
    (sum, f) => sum + (parseFloat(f.amount_usd) || 0),
    0
  );
  const totalIncomeAllocated = filteredIncome.reduce((sum, f) => {
    return sum + (f.budget_allocations || []).reduce(
      (s, a) => s + (parseFloat(a.amount_usd) || 0),
      0
    );
  }, 0);
  const totalIncomeUnallocated = totalIncomeAmount - totalIncomeAllocated;

  let html = `
    <h3 class="report-section-divider">Income Received</h3>
    <div class="stats-grid" style="margin-bottom:20px;">
      <div class="stat-card stat-card--income"><h3>${filteredIncome.length}</h3><p>Records</p></div>
      <div class="stat-card stat-card--income"><h3>$${totalIncomeAmount.toFixed(2)}</h3><p>Total Received</p></div>
      <div class="stat-card stat-card--alloc"><h3>$${totalIncomeAllocated.toFixed(2)}</h3><p>Allocated</p></div>
      <div class="stat-card stat-card--unalloc"><h3>$${totalIncomeUnallocated.toFixed(2)}</h3><p>Unallocated</p></div>
    </div>
    <h4>Income Details</h4>
    <div class="table-container">
      <table class="table-stack-mobile">
        <thead>
          <tr>
            <th>Date</th><th>From</th><th>Bucket</th><th>Amount (Local)</th>
            <th>Amount (USD)</th><th>Description</th><th>Allocations</th>
          </tr>
        </thead>
        <tbody>
  `;

  [...filteredIncome].sort((a, b) => b.date.localeCompare(a.date)).forEach(fund => {
    const usdAmount = parseFloat(fund.amount_usd) || 0;
    const localDisplay = fund.exchange_rate
      ? `${(fund.local_amount || 0).toLocaleString()} ${fund.currency || ''} @ ${fund.exchange_rate}`
      : `${(fund.local_amount || 0).toLocaleString()} ${fund.currency || ''}`;

    if (!(fund.budget_allocations || []).length) {
      html += `
        <tr>
          <td data-label="Date">${fund.date}</td>
          <td data-label="From">${fund.payment_from || '—'}</td>
          <td data-label="Bucket">${getBucketName(fund.bucket_id)}</td>
          <td data-label="Local" class="positive">${localDisplay}</td>
          <td data-label="USD"><strong>$${usdAmount.toFixed(2)}</strong></td>
          <td data-label="Description">${fund.description || '—'}</td>
          <td data-label="Allocations"><span style="color:#999;">Unallocated</span></td>
        </tr>
      `;
      return;
    }

    let totalAllocUsd = 0;
    fund.budget_allocations.forEach(alloc => {
      const allocUsd = parseFloat(alloc.amount_usd) || 0;
      totalAllocUsd += allocUsd;
      const allocLocal = usdAmount > 0 ? (allocUsd / usdAmount) * (fund.local_amount || 0) : 0;
      html += `
        <tr>
          <td data-label="Date">${fund.date}</td>
          <td data-label="From">${fund.payment_from || '—'}</td>
          <td data-label="Bucket">${getBucketName(fund.bucket_id)}</td>
          <td data-label="Local" class="positive">${allocLocal.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${fund.currency || ''}</td>
          <td data-label="USD"><strong>$${allocUsd.toFixed(2)}</strong></td>
          <td data-label="Description">${fund.description || '—'}</td>
          <td data-label="Allocations">${getBudgetName(alloc.budget_id)}</td>
        </tr>
      `;
    });

    const unallocatedUsd = usdAmount - totalAllocUsd;
    if (unallocatedUsd > 0.01) {
      const unallocatedLocal = usdAmount > 0 ? (unallocatedUsd / usdAmount) * (fund.local_amount || 0) : 0;
      html += `
        <tr>
          <td data-label="Date">${fund.date}</td>
          <td data-label="From">${fund.payment_from || '—'}</td>
          <td data-label="Bucket">${getBucketName(fund.bucket_id)}</td>
          <td data-label="Local" class="positive">${unallocatedLocal.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${fund.currency || ''}</td>
          <td data-label="USD"><strong>$${unallocatedUsd.toFixed(2)}</strong></td>
          <td data-label="Description">${fund.description || '—'}</td>
          <td data-label="Allocations"><span style="color:#999;">Unallocated</span></td>
        </tr>
      `;
    }
  });

  html += '</tbody></table></div>';

  html += `
    <h4 style="margin-top:24px;">Budget Allocations</h4>
    <div class="table-container">
      <table class="table-stack-mobile">
        <thead>
          <tr><th>Date</th><th>From</th><th>Budget</th><th>Amount (USD)</th><th>Source Income</th></tr>
        </thead>
        <tbody>
  `;

  let hasAllocRows = false;
  filteredIncome.forEach(fund => {
    (fund.budget_allocations || []).forEach(alloc => {
      hasAllocRows = true;
      html += `
        <tr>
          <td data-label="Date">${fund.date}</td>
          <td data-label="From">${fund.payment_from || '—'}</td>
          <td data-label="Budget">${getBudgetName(alloc.budget_id)}</td>
          <td data-label="USD" class="positive">$${(parseFloat(alloc.amount_usd) || 0).toFixed(2)}</td>
          <td data-label="Source">${fund.description || '—'}</td>
        </tr>
      `;
    });
  });

  if (!hasAllocRows) {
    html += '<tr><td colspan="5" class="empty-state">No allocations in this period.</td></tr>';
  }

  html += '</tbody></table></div>';
  return html;
}

function renderAllBudgetsReport(filtered, filteredIncome, totalUSD) {
  let html = reportHeader('Report Summary');

  html += `
    <div class="stats-grid" style="margin-bottom:20px;">
      <div class="stat-card"><h3>${filtered.length}</h3><p>Transactions</p></div>
      <div class="stat-card"><h3>$${formatUsdDisplay(totalUSD)}</h3><p>Total Spent (USD)</p></div>
    </div>
  `;

  if (filtered.length > 0) {
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
  } else {
    html += '<div class="empty-state"><p>No expenses match the selected filters.</p></div>';
  }

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
        <td data-label="Status">${categoryStatusBadge(budgeted, actual)}</td>
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

  html += renderIncomeSection(filteredIncome);
  return html;
}

function renderSingleBudgetReport(filtered, filteredIncome, budget) {
  const totalBudgeted = budgetedUsd(budget);
  const totalActual = filtered.reduce((sum, e) => sum + (parseFloat(e.usd_amount) || 0), 0);
  const balance = totalBudgeted - totalActual;
  const isOverBudget = balance < 0;

  let html = reportHeader(`Budget Report: ${budget.name}`);

  html += `
    <div class="stats-grid" style="margin-bottom:20px;">
      <div class="stat-card"><h3>${filtered.length}</h3><p>Transactions</p></div>
      <div class="stat-card"><h3>$${totalBudgeted.toFixed(2)}</h3><p>Budgeted (USD)</p></div>
      <div class="stat-card"><h3>$${totalActual.toFixed(2)}</h3><p>Actual (USD)</p></div>
      <div class="stat-card ${isOverBudget ? 'stat-card--danger' : 'stat-card--success'}">
        <h3>$${balance.toFixed(2)}</h3><p>${isOverBudget ? 'Over Budget' : 'Remaining'}</p>
      </div>
    </div>
  `;

  if (filtered.length > 0) {
    html += `
      <h3>Expense Details</h3>
      <div class="table-container">
        <table class="table-stack-mobile">
          <thead>
            <tr>
              <th>Date</th><th>Item</th><th>Category</th><th>Source</th>
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
  }

  html += '<h3 style="margin-top:30px;">Category Performance</h3>';
  html += `
    <div class="table-container">
      <table class="table-stack-mobile">
        <thead>
          <tr><th>Category</th><th>Budgeted (USD)</th><th>Actual (USD)</th><th>Balance</th><th>Status</th></tr>
        </thead>
        <tbody>
  `;

  let catGrandBudgeted = 0;
  let catGrandActual = 0;

  (budget.categories || []).forEach(cat => {
    const catName = cat.category || cat.name;
    const catBudgeted = parseFloat(cat.usdAmount ?? cat.usd_amount) || 0;
    catGrandBudgeted += catBudgeted;
    const catExpenses = filtered.filter(e => getExpenseCategoryLabel(e, teamCategories) === catName);
    const catActual = catExpenses.reduce((sum, e) => sum + (parseFloat(e.usd_amount) || 0), 0);
    catGrandActual += catActual;
    const catBalance = catBudgeted - catActual;
    html += `
      <tr>
        <td data-label="Category"><strong>${catName}</strong>${cat.subcategory ? ` / ${cat.subcategory}` : ''}</td>
        <td data-label="Budgeted">$${catBudgeted.toFixed(2)}</td>
        <td data-label="Actual">$${catActual.toFixed(2)}</td>
        <td data-label="Balance" class="${catBalance < 0 ? 'negative' : 'positive'}" style="font-weight:bold;">$${catBalance.toFixed(2)}</td>
        <td data-label="Status">${categoryStatusBadge(catBudgeted, catActual)}</td>
      </tr>
    `;
  });

  const catGrandBalance = catGrandBudgeted - catGrandActual;
  const catGrandOver = catGrandBalance < 0;
  html += `
      <tr class="status-total">
        <td data-label="Total"><strong>TOTAL</strong></td>
        <td data-label="Budgeted"><strong>$${catGrandBudgeted.toFixed(2)}</strong></td>
        <td data-label="Actual"><strong>$${catGrandActual.toFixed(2)}</strong></td>
        <td data-label="Balance" class="${catGrandOver ? 'negative' : 'positive'}"><strong>$${catGrandBalance.toFixed(2)}</strong></td>
        <td data-label="Status"><span class="badge badge-${catGrandOver ? 'danger' : 'success'}">${catGrandOver ? 'Over Budget' : 'On Track'}</span></td>
      </tr>
    </tbody></table></div>
  `;

  if (!filtered.length) {
    html += '<div class="empty-state" style="margin-top:16px;"><p>No transactions for this budget in the selected period.</p></div>';
  }

  html += renderIncomeSection(filteredIncome);
  return html;
}
