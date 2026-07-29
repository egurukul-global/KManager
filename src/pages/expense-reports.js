// ==================== EXPENSE REPORTS ====================
import { state } from '../state.js';
import { sbSelect, sbInsert, sbUpdate } from '../db.js';
import { showToast } from '../components/toasts.js';
import { getBudgetStatus } from '../utils/budgetStatus.js';
import { getExpenseCategoryLabel } from '../utils/expenseHelpers.js';
import { formatUsdDisplay } from '../utils/currency.js';
import { exportExpenseReportToPdf, buildReportPdfDefinition } from '../utils/reportPdf.js';
import { resolveReceiptViewUrl, isExternalReceiptUrl, uploadReportPdf } from '../utils/upload.js';
import {
  DEFAULT_REPORT_SECTIONS,
  truncReportItem,
  getReportTeamName,
  buildReportFilterDescription,
  scopeIncomeForReport,
  budgetedUsd,
  categoryStatusBadge,
  aggregateSpendByCategory
} from '../utils/reportHelpers.js';

let teamBuckets = [];
let teamBudgets = [];
let teamCategories = [];
let teamExpenses = [];
let teamIncome = [];
let teamAttachments = [];
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

function getTeamName() {
  return getReportTeamName(state);
}

function reportPageTitle() {
  return `One Kailasa Report for ${getTeamName()}`;
}

function reportHeader(showPdf = true) {
  const pdfBtn = showPdf
    ? `<button type="button" class="pdf-export-btn" onclick="window.exportExpenseReportToPDF()">📄 Export to PDF</button>`
    : '';
  return `
    <div class="report-results-header">
      <div>
        <h3 class="report-main-title">${reportPageTitle()}</h3>
        <p id="reportFilterLine" class="report-filter-line"></p>
      </div>
      ${pdfBtn}
    </div>
  `;
}

function setFilterLine(filters, budget) {
  const parts = buildReportFilterDescription(filters, budget, getBucketName);
  const el = document.getElementById('reportFilterLine');
  if (el) {
    el.textContent = parts.length ? parts.join(' · ') : '';
    el.style.display = parts.length ? '' : 'none';
  }
}

export function getExpenseReportsPage() {
  return `
    <h1 class="page-title">Reports</h1>

    <div class="tabs-container" style="margin-bottom: 20px; display: flex; gap: 10px; border-bottom: 1px solid var(--border); padding-bottom: 10px;">
      <button type="button" class="tab-btn active" id="btnTabGenerate" onclick="window.switchReportsTab('generate')" style="background: none; border: none; padding: 8px 16px; cursor: pointer; font-weight: bold; border-bottom: 3px solid var(--primary); color: var(--text);">Generate Report</button>
      <button type="button" class="tab-btn" id="btnTabLogs" onclick="window.switchReportsTab('logs')" style="background: none; border: none; padding: 8px 16px; cursor: pointer; color: var(--text-secondary);">Reports Log</button>
    </div>

    <!-- Generate Tab Content -->
    <div id="tabContentGenerate" class="tab-content active-content">
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
            <button type="button" onclick="window.promptAndGenerateExpenseReport()">Generate Report</button>
            <button type="button" class="secondary" onclick="window.resetExpenseReportFilters()">Reset</button>
          </div>
        </div>
        <div id="expenseReportResults"></div>
      </div>
    </div>

    <!-- Logs Tab Content -->
    <div id="tabContentLogs" class="tab-content" style="display: none;">
      <div class="card">
        <h2>Reports Log</h2>
        <div class="table-container">
          <table class="table-stack-mobile">
            <thead>
              <tr>
                <th>Date Generated</th>
                <th>Budget</th>
                <th>Filter Criteria</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody id="reportLogsTableBody">
              <tr><td colspan="5" class="empty-state">Loading logs...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

export async function initExpenseReportsPage() {
  window.promptAndGenerateExpenseReport = promptAndGenerateExpenseReport;
  window.resetExpenseReportFilters = resetExpenseReportFilters;
  window.onReportBudgetChange = onReportBudgetChange;
  window.exportExpenseReportToPDF = exportReportToPDF;
  window.switchReportsTab = switchReportsTab;
  window.downloadReportPdf = downloadReportPdf;
  window.cancelReportLog = cancelReportLog;

  const teamId = state.currentTeam?.team_id;
  if (!teamId) return;

  try {
    const [bucketsRes, budgetsRes, categoriesRes, expensesRes, incomeRes, attachmentsRes] = await Promise.all([
      sbSelect('buckets', { teamId, orderBy: 'name', ascending: true }),
      sbSelect('budget_plans', { teamId, orderBy: 'name', ascending: true }),
      sbSelect('categories', { teamId, orderBy: 'name', ascending: true }),
      sbSelect('expenses', { teamId, orderBy: 'date', ascending: false }),
      sbSelect('income', { teamId, orderBy: 'date', ascending: false }),
      sbSelect('expense_attachments', { teamId })
    ]);

    teamBuckets = (bucketsRes.data || []).filter(b => !b.is_deleted);
    teamBudgets = (budgetsRes.data || []).filter(b => !b.is_deleted).map(normalizeBudget);
    teamCategories = (categoriesRes.data || []).filter(c => !c.is_deleted);
    teamExpenses = (expensesRes.data || []).filter(e => !e.is_deleted);
    teamIncome = (incomeRes.data || []).filter(i => !i.is_deleted);
    teamAttachments = (attachmentsRes.data || []).filter(a => !a.is_deleted);

    populateReportFilters();
    // Default start values
    setTimeout(() => refreshReportLogs(), 50);
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
      const status = getBudgetStatus(b);
      if (
        status === 'approved' ||
        status === 'paid' ||
        status === 'received' ||
        status === 'archived'
      ) {
        budgetSelect.innerHTML += `<option value="${b.id}">${b.name}</option>`;
      }
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

function filterIncomeByDates(filters) {
  const { start, end } = filters;
  return teamIncome.filter(rec => {
    if (start && rec.date < start) return false;
    if (end && rec.date > end) return false;
    return true;
  });
}

function showReportSectionsModal() {
  return new Promise(resolve => {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
      <div class="modal-content small entry-form-card report-sections-modal">
        <button type="button" class="close-modal" id="rptSecClose">&times;</button>
        <h2>Report Sections</h2>
        <p class="report-sections-hint">Choose what to include in this report.</p>
        <div class="report-sections-list">
          <label class="report-section-check"><input type="checkbox" id="rptSec_expenseDetail" checked> Expense Detail</label>
          <label class="report-section-check"><input type="checkbox" id="rptSec_categorySummary" checked> Category Summary</label>
          <label class="report-section-check"><input type="checkbox" id="rptSec_incomeSummary" checked> Income Summary</label>
          <label class="report-section-check"><input type="checkbox" id="rptSec_incomeDetail" checked> Income Detail</label>
          <label class="report-section-check"><input type="checkbox" id="rptSec_budgetAllocations" checked> Budget Allocations</label>
          <label class="report-section-check"><input type="checkbox" id="rptSec_financialSummary" checked> Financial Summary</label>
        </div>
        <div class="btn-group">
          <button type="button" id="rptSecGenerate">Generate Report</button>
          <button type="button" class="secondary" id="rptSecCancel">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const close = (result) => {
      modal.remove();
      resolve(result);
    };

    modal.querySelector('#rptSecClose').onclick = () => close(null);
    modal.querySelector('#rptSecCancel').onclick = () => close(null);
    modal.onclick = e => { if (e.target === modal) close(null); };

    modal.querySelector('#rptSecGenerate').onclick = () => {
      const sections = {
        expenseDetail: modal.querySelector('#rptSec_expenseDetail').checked,
        categorySummary: modal.querySelector('#rptSec_categorySummary').checked,
        incomeSummary: modal.querySelector('#rptSec_incomeSummary').checked,
        incomeDetail: modal.querySelector('#rptSec_incomeDetail').checked,
        budgetAllocations: modal.querySelector('#rptSec_budgetAllocations').checked,
        financialSummary: modal.querySelector('#rptSec_financialSummary').checked
      };
      if (!Object.values(sections).some(Boolean)) {
        showToast('Select at least one report section.', 'warning');
        return;
      }
      close(sections);
    };
  });
}

async function promptAndGenerateExpenseReport() {
  const sections = await showReportSectionsModal();
  if (!sections) return;

  const start = document.getElementById('reportStart')?.value || '';
  const end = document.getElementById('reportEnd')?.value || '';
  const budgetId = document.getElementById('reportBudget')?.value || '';
  const category = document.getElementById('reportCategory')?.value || '';
  const sourceId = document.getElementById('reportSource')?.value || '';
  const currency = document.getElementById('reportCurrency')?.value || '';
  const filters = { start, end, budgetId, category, sourceId, currency };

  const logId = crypto.randomUUID();
  const teamId = state.currentTeam?.team_id;
  if (!teamId) return;
  const now = new Date().toISOString();

  showToast('Generating report in background...', 'info');

  try {
    await sbInsert('report_logs', {
      id: logId,
      team_id: teamId,
      budget_id: budgetId || null,
      filters,
      sections,
      status: 'in_progress',
      created_by: state.user.id,
      created_at: now,
      updated_at: now
    });

    // Switch tab to Logs
    switchReportsTab('logs');

    // Run in background without blocking
    processReportGenerationInBg(logId, filters, sections);

  } catch (err) {
    showToast(err.message || 'Failed to start report generation', 'error');
  }
}

async function exportReportToPDF() {
  if (!lastReportSnapshot) {
    showToast('Generate a report first, then export to PDF.', 'warning');
    return;
  }

  const pdfBtn = document.getElementById('reportPdfBtn');
  const originalText = pdfBtn ? pdfBtn.innerHTML : 'PDF';
  if (pdfBtn) {
    pdfBtn.disabled = true;
    pdfBtn.innerHTML = '<span class="spinner-small" style="display:inline-block;margin-right:6px;"></span>Loading Links...';
  }

  try {
    const resolvedExpenses = await Promise.all(
      (lastReportSnapshot.filteredExpenses || []).map(async (exp) => {
        const keys = [exp.receipt_url].filter(Boolean);
        const childAttachments = (teamAttachments || []).filter(a => a.expense_id === exp.id && !a.is_deleted).map(a => a.file_url);
        const allKeys = [...new Set([...keys, ...childAttachments])];
        if (!allKeys.length) return exp;
        try {
          const resolvedUrls = await Promise.all(allKeys.map(async (key) => {
            if (isExternalReceiptUrl(key)) return key;
            return await resolveReceiptViewUrl(key);
          }));
          return { ...exp, receipts_resolved_urls: resolvedUrls };
        } catch {
          return exp;
        }
      })
    );

    exportExpenseReportToPdf({
      ...lastReportSnapshot,
      filteredExpenses: resolvedExpenses,
      getBucketName,
      getBudgetName
    });
  } catch (err) {
    showToast('Failed to prepare PDF exports', 'error');
  } finally {
    if (pdfBtn) {
      pdfBtn.disabled = false;
      pdfBtn.innerHTML = originalText;
    }
  }
}

function generateExpenseReport(sections = { ...DEFAULT_REPORT_SECTIONS }) {
  const start = document.getElementById('reportStart')?.value || '';
  const end = document.getElementById('reportEnd')?.value || '';
  const budgetId = document.getElementById('reportBudget')?.value || '';
  const category = document.getElementById('reportCategory')?.value || '';
  const sourceId = document.getElementById('reportSource')?.value || '';
  const currency = document.getElementById('reportCurrency')?.value || '';

  const filters = { start, end, budgetId, category, sourceId, currency };
  const filtered = filterExpenses(filters);
  const incomeByDate = filterIncomeByDates(filters);
  const incomeScope = scopeIncomeForReport(incomeByDate, budgetId || null);
  const container = document.getElementById('expenseReportResults');
  if (!container) return;

  const budget = budgetId ? teamBudgets.find(b => b.id === budgetId) : null;

  lastReportSnapshot = {
    filteredExpenses: filtered,
    incomeScope,
    filters,
    budget,
    teamCategories,
    teamBuckets,
    teamBudgets,
    sections,
    teamName: getTeamName()
  };

  container.innerHTML = renderReport({
    filtered,
    incomeScope,
    filters,
    budget,
    sections
  });

  setFilterLine(filters, budget);
  hydrateReportReceiptCells();
}

async function hydrateReportReceiptCells() {
  const cells = document.querySelectorAll('.receipt-cell[data-receipt-stored]');
  await Promise.all([...cells].map(async (el) => {
    const storedStr = el.getAttribute('data-receipt-stored') || '';
    const storedKeys = storedStr.split(',').filter(Boolean);
    if (!storedKeys.length) {
      el.textContent = '—';
      return;
    }
    try {
      const linksHtmls = await Promise.all(storedKeys.map(async (key, idx) => {
        try {
          if (isExternalReceiptUrl(key)) {
            return `<a href="${key}" target="_blank" rel="noopener" style="text-decoration: none; font-weight: bold; color: var(--primary);">📎${idx + 1}</a>`;
          }
          const viewUrl = await resolveReceiptViewUrl(key);
          return `<a href="${viewUrl}" target="_blank" rel="noopener" style="text-decoration: none; font-weight: bold; color: var(--primary);">📎${idx + 1}</a>`;
        } catch {
          return '<span title="Could not load">📎</span>';
        }
      }));
      el.innerHTML = `<div style="display:flex;gap:6px;align-items:center;">${linksHtmls.join('')}</div>`;
    } catch {
      el.innerHTML = '—';
    }
  }));
}

function renderReport({ filtered, incomeScope, filters, budget, sections }) {
  let html = reportHeader(true);

  if (budget) {
    const totalBudgeted = budgetedUsd(budget);
    const totalActual = filtered.reduce((sum, e) => sum + (parseFloat(e.usd_amount) || 0), 0);
    const balance = totalBudgeted - totalActual;
    html += `
      <div class="stats-grid" style="margin-bottom:20px;">
        <div class="stat-card"><h3>${filtered.length}</h3><p>Transactions</p></div>
        <div class="stat-card"><h3>$${totalBudgeted.toFixed(2)}</h3><p>Budgeted (USD)</p></div>
        <div class="stat-card"><h3>$${totalActual.toFixed(2)}</h3><p>Actual (USD)</p></div>
        <div class="stat-card ${balance < 0 ? 'stat-card--danger' : 'stat-card--success'}">
          <h3>$${balance.toFixed(2)}</h3><p>${balance < 0 ? 'Over Budget' : 'Remaining'}</p>
        </div>
      </div>
    `;
  } else if (sections.expenseDetail) {
    const totalUSD = filtered.reduce((sum, e) => sum + (parseFloat(e.usd_amount) || 0), 0);
    html += `
      <div class="stats-grid" style="margin-bottom:20px;">
        <div class="stat-card"><h3>${filtered.length}</h3><p>Transactions</p></div>
        <div class="stat-card"><h3>$${formatUsdDisplay(totalUSD)}</h3><p>Total Spent (USD)</p></div>
      </div>
    `;
  }

  if (sections.expenseDetail) {
    html += renderExpenseDetails(filtered, !!budget);
  }

  if (sections.categorySummary) {
    if (budget) {
      html += renderCategoryPerformance(filtered, budget);
    } else {
      html += renderBudgetVsActual(filtered, filters);
      html += renderSpendingByCategory(filtered);
    }
  }

  if (sections.incomeSummary) {
    html += renderIncomeSummary(incomeScope, budget);
  }

  if (sections.incomeDetail) {
    html += renderIncomeDetails(incomeScope, budget);
  }

  if (sections.budgetAllocations) {
    html += renderBudgetAllocations(incomeScope);
  }

  if (sections.financialSummary) {
    html += renderFinancialSummary();
  }

  return html;
}

function renderExpenseDetails(filtered, singleBudget) {
  let html = '<h3>Expense Details</h3>';

  if (!filtered.length) {
    return html + '<div class="empty-state"><p>No expenses match the selected filters.</p></div>';
  }

  html += `
    <div class="table-container report-expense-table">
      <table class="table-stack-mobile">
        <thead>
          <tr>
            <th>Date</th>
            <th class="col-item">Item</th>
            ${singleBudget ? '' : '<th>Budget</th>'}
            <th>Category</th>
            <th>Source</th>
            <th class="col-amount">Local</th>
            <th class="col-rate">Rate</th>
            <th class="col-usd">USD</th>
            <th>Receipt</th>
          </tr>
        </thead>
        <tbody>
  `;

  [...filtered].sort((a, b) => b.date.localeCompare(a.date)).forEach(exp => {
    const keys = [exp.receipt_url].filter(Boolean);
    const childAttachments = (teamAttachments || []).filter(a => a.expense_id === exp.id && !a.is_deleted).map(a => a.file_url);
    const allKeys = [...new Set([...keys, ...childAttachments])];
    const receiptLink = allKeys.length
      ? `<span class="receipt-cell" data-receipt-stored="${String(allKeys.join(',')).replace(/"/g, '&quot;')}">…</span>`
      : '—';
    html += `
      <tr>
        <td data-label="Date">${exp.date}</td>
        <td data-label="Item" class="col-item" title="${(exp.item || '').replace(/"/g, '&quot;')}">${truncReportItem(exp.item)}</td>
        ${singleBudget ? '' : `<td data-label="Budget">${getBudgetName(exp.budget_id)}</td>`}
        <td data-label="Category">${getExpenseCategoryLabel(exp, teamCategories)}</td>
        <td data-label="Source">${getBucketName(exp.bucket_id)}</td>
        <td data-label="Local" class="col-amount">${(exp.local_amount || 0).toLocaleString()} ${exp.currency || ''}</td>
        <td data-label="Rate" class="col-rate">${exp.rate ?? '—'}</td>
        <td data-label="USD" class="col-usd">$${(exp.usd_amount || 0).toFixed(2)}</td>
        <td data-label="Receipt">${receiptLink}</td>
      </tr>
    `;
  });

  html += '</tbody></table></div>';
  return html;
}

function renderCategoryPerformance(filtered, budget) {
  let html = '<h3 style="margin-top:30px;">Category Performance</h3>';
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
    const catActual = filtered
      .filter(e => getExpenseCategoryLabel(e, teamCategories) === catName)
      .reduce((sum, e) => sum + (parseFloat(e.usd_amount) || 0), 0);
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
  return html;
}

function renderBudgetVsActual(filtered, filters) {
  let relevantBudgets = [...teamBudgets];
  if (filters.category || filters.sourceId || filters.currency) {
    const ids = new Set(filtered.map(e => e.budget_id));
    relevantBudgets = teamBudgets.filter(b => ids.has(b.id));
  }

  let html = '<h3 style="margin-top:30px;">Budget vs Actual</h3>';
  html += `
    <div class="table-container">
      <table class="table-stack-mobile">
        <thead>
          <tr><th>Budget</th><th>Budgeted (USD)</th><th>Actual (USD)</th><th>Balance (USD)</th><th>Status</th></tr>
        </thead>
        <tbody>
  `;

  let grandBudgeted = 0;
  let grandActual = 0;
  let grandBalance = 0;

  relevantBudgets.forEach(b => {
    const budgeted = budgetedUsd(b);
    const actual = filtered.filter(e => e.budget_id === b.id)
      .reduce((sum, e) => sum + (parseFloat(e.usd_amount) || 0), 0);
    const balance = budgeted - actual;
    grandBudgeted += budgeted;
    grandActual += actual;
    grandBalance += balance;
    const over = balance < 0;
    html += `
      <tr>
        <td data-label="Budget"><strong>${b.name}</strong></td>
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
  return html;
}

function renderSpendingByCategory(filtered) {
  const byCat = aggregateSpendByCategory(filtered, teamCategories);
  if (!byCat.length) return '';

  let html = '<h3 style="margin-top:24px;">Spending by Category</h3>';
  html += `
    <div class="table-container">
      <table class="table-stack-mobile">
        <thead><tr><th>Category</th><th>Transactions</th><th>Actual (USD)</th></tr></thead>
        <tbody>
  `;
  let total = 0;
  byCat.forEach(row => {
    total += row.actual;
    html += `
      <tr>
        <td data-label="Category">${row.category}</td>
        <td data-label="Transactions">${row.count}</td>
        <td data-label="Actual">$${row.actual.toFixed(2)}</td>
      </tr>
    `;
  });
  html += `
      <tr class="status-total">
        <td data-label="Total"><strong>TOTAL</strong></td>
        <td data-label="Transactions"><strong>${filtered.length}</strong></td>
        <td data-label="Actual"><strong>$${total.toFixed(2)}</strong></td>
      </tr>
    </tbody></table></div>
  `;
  return html;
}

function renderIncomeSummary(incomeScope, budget) {
  const { summary, records } = incomeScope;
  if (!summary || !records.length) {
    return '<h3 class="report-section-divider">Income Summary</h3><div class="empty-state"><p>No income for the selected criteria.</p></div>';
  }

  const title = budget ? `Income Summary — ${budget.name}` : 'Income Summary';
  let html = `<h3 class="report-section-divider">${title}</h3>`;
  html += '<div class="stats-grid" style="margin-bottom:20px;">';

  if (summary.budgetScoped) {
    html += `
      <div class="stat-card stat-card--income"><h3>${summary.recordCount}</h3><p>Allocation Records</p></div>
      <div class="stat-card stat-card--alloc"><h3>$${summary.allocated.toFixed(2)}</h3><p>Allocated to Budget</p></div>
    `;
  } else {
    html += `
      <div class="stat-card stat-card--income"><h3>${summary.recordCount}</h3><p>Records</p></div>
      <div class="stat-card stat-card--income"><h3>$${summary.totalReceived.toFixed(2)}</h3><p>Total Received</p></div>
      <div class="stat-card stat-card--alloc"><h3>$${summary.allocated.toFixed(2)}</h3><p>Allocated</p></div>
      <div class="stat-card stat-card--unalloc"><h3>$${summary.unallocated.toFixed(2)}</h3><p>Unallocated</p></div>
    `;
  }

  html += '</div>';
  return html;
}

function renderIncomeDetails(incomeScope, budget) {
  const { records } = incomeScope;
  if (!records.length) return '';

  const title = budget ? `Income Details — ${budget.name}` : 'Income Details';
  let html = `<h4>${title}</h4>`;
  html += `
    <div class="table-container">
      <table class="table-stack-mobile">
        <thead>
          <tr>
            <th>Date</th><th>From</th><th>Bucket</th><th>Amount (Local)</th>
            <th>Amount (USD)</th><th>Description</th><th>Allocation</th>
          </tr>
        </thead>
        <tbody>
  `;

  [...records].sort((a, b) => b.date.localeCompare(a.date)).forEach(fund => {
    const fundUsd = parseFloat(fund.amount_usd) || 0;
    const allocs = fund.budget_allocations || [];

    if (!allocs.length) {
      const localDisplay = fund.exchange_rate
        ? `${(fund.local_amount || 0).toLocaleString()} ${fund.currency || ''} @ ${fund.exchange_rate}`
        : `${(fund.local_amount || 0).toLocaleString()} ${fund.currency || ''}`;
      html += `
        <tr>
          <td data-label="Date">${fund.date}</td>
          <td data-label="From">${fund.payment_from || '—'}</td>
          <td data-label="Bucket">${getBucketName(fund.bucket_id)}</td>
          <td data-label="Local" class="positive">${localDisplay}</td>
          <td data-label="USD"><strong>$${fundUsd.toFixed(2)}</strong></td>
          <td data-label="Description">${fund.description || '—'}</td>
          <td data-label="Allocation"><span style="color:#999;">Unallocated</span></td>
        </tr>
      `;
      return;
    }

    allocs.forEach(alloc => {
      const allocUsd = parseFloat(alloc.amount_usd) || 0;
      const allocLocal = fundUsd > 0 ? (allocUsd / fundUsd) * (fund.local_amount || 0) : 0;
      html += `
        <tr>
          <td data-label="Date">${fund.date}</td>
          <td data-label="From">${fund.payment_from || '—'}</td>
          <td data-label="Bucket">${getBucketName(fund.bucket_id)}</td>
          <td data-label="Local" class="positive">${allocLocal.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${fund.currency || ''}</td>
          <td data-label="USD"><strong>$${allocUsd.toFixed(2)}</strong></td>
          <td data-label="Description">${fund.description || '—'}</td>
          <td data-label="Allocation">${getBudgetName(alloc.budget_id)}</td>
        </tr>
      `;
    });
  });

  html += '</tbody></table></div>';
  return html;
}

function renderBudgetAllocations(incomeScope) {
  const { records } = incomeScope;
  let html = '<h4 style="margin-top:24px;">Budget Allocations</h4>';
  html += `
    <div class="table-container">
      <table class="table-stack-mobile">
        <thead>
          <tr><th>Date</th><th>From</th><th>Budget</th><th>Amount (USD)</th><th>Source Income</th></tr>
        </thead>
        <tbody>
  `;

  let hasRows = false;
  records.forEach(fund => {
    (fund.budget_allocations || []).forEach(alloc => {
      hasRows = true;
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

  if (!hasRows) {
    html += '<tr><td colspan="5" class="empty-state">No allocations for the selected criteria.</td></tr>';
  }

  html += '</tbody></table></div>';
  return html;
}

function renderFinancialSummary() {
  let html = '<h3 class="report-section-divider">Financial Summary — Bucket Balances</h3>';
  if (!teamBuckets.length) {
    return html + '<div class="empty-state"><p>No buckets configured.</p></div>';
  }

  html += `
    <div class="table-container">
      <table class="table-stack-mobile">
        <thead><tr><th>Bucket</th><th>Currency</th><th>Balance</th></tr></thead>
        <tbody>
  `;

  teamBuckets.forEach(b => {
    html += `
      <tr>
        <td data-label="Bucket"><strong>${b.name}</strong></td>
        <td data-label="Currency">${b.currency || '—'}</td>
        <td data-label="Balance">${(parseFloat(b.balance) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
      </tr>
    `;
  });

  html += '</tbody></table></div>';
  return html;
}

export function switchReportsTab(tabName) {
  const tabGenerate = document.getElementById('tabContentGenerate');
  const tabLogs = document.getElementById('tabContentLogs');
  const btnGenerate = document.getElementById('btnTabGenerate');
  const btnLogs = document.getElementById('btnTabLogs');
  
  if (tabName === 'generate') {
    if (tabGenerate) tabGenerate.style.display = 'block';
    if (tabLogs) tabLogs.style.display = 'none';
    if (btnGenerate) {
      btnGenerate.classList.add('active');
      btnGenerate.style.borderBottom = '3px solid var(--primary)';
    }
    if (btnLogs) {
      btnLogs.classList.remove('active');
      btnLogs.style.borderBottom = 'none';
    }
  } else {
    if (tabGenerate) tabGenerate.style.display = 'none';
    if (tabLogs) tabLogs.style.display = 'block';
    if (btnGenerate) {
      btnGenerate.classList.remove('active');
      btnGenerate.style.borderBottom = 'none';
    }
    if (btnLogs) {
      btnLogs.classList.add('active');
      btnLogs.style.borderBottom = '3px solid var(--primary)';
    }
    refreshReportLogs();
  }
}

async function refreshReportLogs() {
  const tbody = document.getElementById('reportLogsTableBody');
  if (!tbody) return;

  const teamId = state.currentTeam?.team_id;
  if (!teamId) return;

  try {
    const res = await sbSelect('report_logs', { teamId, orderBy: 'created_at', ascending: false });
    const logs = (res.data || []).filter(l => !l.is_deleted);

    if (!logs.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No reports generated yet.</td></tr>';
      return;
    }

    tbody.innerHTML = logs.map(l => {
      let statusHtml = '';
      let actionHtml = '';

      if (l.status === 'in_progress') {
        statusHtml = '<span class="status-badge" style="background:#fff3cd;color:#856404;font-size:0.75rem;padding:4px 8px;border-radius:4px;"><span class="spinner-inline" style="margin-right:4px;"></span>In Progress</span>';
        actionHtml = `<div style="display:flex;gap:8px;align-items:center;"><span style="color:var(--text-secondary);font-size:0.85rem;">Processing…</span><button type="button" class="btn btn-danger btn-xs" style="padding:2px 6px;font-size:0.7rem;border:none;border-radius:4px;color:white;cursor:pointer;" onclick="window.cancelReportLog('${l.id}')">❌ Cancel</button></div>`;
      } else if (l.status === 'failed') {
        statusHtml = `<span class="status-badge" style="background:#f8d7da;color:#721c24;font-size:0.75rem;padding:4px 8px;border-radius:4px;" title="${(l.error_message || '').replace(/"/g, '&quot;')}">⚠️ Failed</span>`;
        actionHtml = `<span class="form-hint" style="color:var(--danger);font-size:0.75rem;">${l.error_message || 'Unknown error'}</span>`;
      } else {
        statusHtml = '<span class="status-badge" style="background:#d4edda;color:#155724;font-size:0.75rem;padding:4px 8px;border-radius:4px;">✅ Completed</span>';
        actionHtml = `<button type="button" class="btn btn-secondary btn-xs" onclick="window.downloadReportPdf('${l.id}')">⬇️ Download PDF</button>`;
      }

      const dateStr = new Date(l.created_at).toLocaleString();
      
      let filterDesc = 'All expenses';
      if (l.filters) {
        const parts = [];
        if (l.filters.start) parts.push(`From ${l.filters.start}`);
        if (l.filters.end) parts.push(`To ${l.filters.end}`);
        if (l.filters.category) parts.push(l.filters.category);
        if (l.filters.currency) parts.push(l.filters.currency);
        if (parts.length) filterDesc = parts.join(' · ');
      }

      let budgetName = 'All Budgets';
      if (l.budget_id) {
        budgetName = teamBudgets.find(b => b.id === l.budget_id)?.name || 'Unknown Budget';
      }

      return `
        <tr>
          <td data-label="Date Generated">${dateStr}</td>
          <td data-label="Budget">${budgetName}</td>
          <td data-label="Filter Criteria" style="font-size:0.8rem;color:var(--text-secondary);">${filterDesc}</td>
          <td data-label="Status">${statusHtml}</td>
          <td data-label="Action">${actionHtml}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state" style="color:var(--danger);">Failed to load logs: ${err.message}</td></tr>`;
  }
}

async function downloadReportPdf(logId) {
  try {
    const teamId = state.currentTeam?.team_id;
    const logRes = await sbSelect('report_logs', { teamId });
    const log = (logRes.data || []).find(l => l.id === logId);
    if (!log || !log.file_url) throw new Error('Report file not found');

    showToast('Resolving download link…', 'info');
    const viewUrl = await resolveReceiptViewUrl(log.file_url);
    
    // Open in a new tab to download
    window.open(viewUrl, '_blank');
  } catch (err) {
    showToast(err.message || 'Download failed', 'error');
  }
}

async function fetchBase64Image(key) {
  try {
    if (isExternalReceiptUrl(key)) return [key];
    const viewUrl = await resolveReceiptViewUrl(key);
    const res = await fetch(viewUrl);
    if (!res.ok) throw new Error(`Fetch R2 asset failed with status ${res.status}`);
    const blob = await res.blob();
    
    const isPdf = /\.pdf($|\?)/i.test(key) || blob.type === 'application/pdf';
    if (isPdf) {
      const { convertPdfToImages } = await import('../utils/pdfConverter.js');
      const arrayBuffer = await blob.arrayBuffer();
      return await convertPdfToImages(arrayBuffer);
    }
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve([reader.result]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.error('Failed to load base64 for receipt:', key, err);
    return null;
  }
}

async function processReportGenerationInBg(logId, filters, sections) {
  const teamId = state.currentTeam?.team_id;
  const now = new Date().toISOString();

  try {
    // 1. Filter expenses
    const filtered = filterExpenses(filters);
    const incomeByDate = filterIncomeByDates(filters);
    const incomeScope = scopeIncomeForReport(incomeByDate, filters.budgetId || null);
    const budget = filters.budgetId ? teamBudgets.find(b => b.id === filters.budgetId) : null;

    // 2. Resolve all attachments to base64 images (concurrently)
    const resolvedExpenses = await Promise.all(
      filtered.map(async (exp) => {
        const keys = [exp.receipt_url].filter(Boolean);
        const childAttachments = (teamAttachments || []).filter(a => a.expense_id === exp.id && !a.is_deleted).map(a => a.file_url);
        const allKeys = [...new Set([...keys, ...childAttachments])];
        if (!allKeys.length) return exp;

        const images = [];
        for (const key of allKeys) {
          const imgs = await fetchBase64Image(key);
          if (imgs) {
            images.push(...imgs);
          }
        }
        return { ...exp, receipt_images: images };
      })
    );

    // 3. Compile PDF docDefinition
    const docDefinition = buildReportPdfDefinition({
      filteredExpenses: resolvedExpenses,
      incomeScope,
      filters,
      budget,
      teamCategories,
      teamBuckets,
      sections,
      teamName: getReportTeamName(state),
      getBucketName,
      getBudgetName,
      teamBudgets
    });

    const pdfMake = window.pdfMake;
    if (!pdfMake) throw new Error('PDF compiler library (pdfMake) is not loaded.');

    // 4. Generate Blob
    const pdfDoc = pdfMake.createPdf(docDefinition);
    const pdfBlob = await new Promise(resolve => pdfDoc.getBlob(resolve));

    // 5. Upload to Cloudflare R2
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `reports/report-${filters.budgetId || 'global'}-${Date.now()}.pdf`;
    const objectKey = await uploadReportPdf(pdfBlob, filename);

    // 6. Update database status
    await sbUpdate('report_logs', {
      status: 'completed',
      file_url: objectKey,
      updated_at: now
    }, { id: logId });

  } catch (err) {
    console.error('Background report compilation error:', err);
    await sbUpdate('report_logs', {
      status: 'failed',
      error_message: err.message || 'Verification or compilation failed',
      updated_at: now
    }, { id: logId });
  } finally {
    // Notify the UI to refresh logs list
    refreshReportLogs();
  }
}

async function cancelReportLog(logId) {
  try {
    const teamId = state.currentTeam?.team_id;
    if (!teamId) return;

    showToast('Cancelling report...', 'info');

    await sbUpdate('report_logs', {
      status: 'failed',
      error_message: 'Cancelled by user',
      updated_at: new Date().toISOString()
    }, { id: logId });

    showToast('Report cancelled successfully', 'success');
    refreshReportLogs();
  } catch (err) {
    console.error('Cancel report log error:', err);
    showToast(err.message || 'Failed to cancel report', 'error');
  }
}
