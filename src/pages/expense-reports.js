// ==================== EXPENSE REPORTS ====================
import { state } from '../state.js';
import { sbSelect, sbInsert, sbUpdate, supabaseClient } from '../db.js';
import { showToast, showConfirm } from '../components/toasts.js';
import { getBudgetStatus } from '../utils/budgetStatus.js';
import { getExpenseCategoryLabel } from '../utils/expenseHelpers.js';
import { formatUsdDisplay } from '../utils/currency.js';
import { exportExpenseReportToPdf, buildReportPdfDefinition } from '../utils/reportPdf.js';
import { downloadCSV, convertArrayOfObjectsToCSV } from '../utils/exportCsv.js';
import { resolveReceiptViewUrl, isExternalReceiptUrl, uploadReportPdf } from '../utils/upload.js';
import { convertPdfToImages } from '../utils/pdfConverter.js';
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
  const buttons = showPdf
    ? `<div style="display:flex; gap:10px;">
         <button type="button" class="pdf-export-btn" id="reportCsvBtn" onclick="window.exportExpenseReportToCSV()">Export to CSV</button>
         <button type="button" class="pdf-export-btn" id="reportPdfBtn" onclick="window.exportExpenseReportToPDF()">Export to PDF</button>
       </div>`
    : '';
  return `
    <div class="report-results-header">
      <div>
        <h3 class="report-main-title">${reportPageTitle()}</h3>
        <p id="reportFilterLine" class="report-filter-line"></p>
      </div>
      ${buttons}
    </div>
  `;
}

function setFilterLine(filters, budget) {
  const parts = buildReportFilterDescription(filters, budget, getBucketName);
  const el = document.getElementById('reportFilterLine');
  if (el) {
    el.textContent = parts.length ? parts.join(' Â· ') : '';
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
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody id="reportLogsTableBody">
              <tr><td colspan="4" class="empty-state">Loading logs...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function switchReportsTab(tabName) {
  const btnGen = document.getElementById('btnTabGenerate');
  const btnLogs = document.getElementById('btnTabLogs');
  const tabGen = document.getElementById('tabContentGenerate');
  const tabLogs = document.getElementById('tabContentLogs');

  if (!btnGen || !btnLogs || !tabGen || !tabLogs) return;

  if (tabName === 'generate') {
    btnGen.classList.add('active');
    btnGen.style.fontWeight = 'bold';
    btnGen.style.borderBottom = '3px solid var(--primary)';
    btnGen.style.color = 'var(--text)';

    btnLogs.classList.remove('active');
    btnLogs.style.fontWeight = 'normal';
    btnLogs.style.borderBottom = 'none';
    btnLogs.style.color = 'var(--text-secondary)';

    tabGen.style.display = 'block';
    tabLogs.style.display = 'none';
  } else {
    btnLogs.classList.add('active');
    btnLogs.style.fontWeight = 'bold';
    btnLogs.style.borderBottom = '3px solid var(--primary)';
    btnLogs.style.color = 'var(--text)';

    btnGen.classList.remove('active');
    btnGen.style.fontWeight = 'normal';
    btnGen.style.borderBottom = 'none';
    btnGen.style.color = 'var(--text-secondary)';

    tabLogs.style.display = 'block';
    tabGen.style.display = 'none';
  }
}

export async function initExpenseReportsPage() {
  window.promptAndGenerateExpenseReport = promptAndGenerateExpenseReport;
  window.resetExpenseReportFilters = resetExpenseReportFilters;
  window.onReportBudgetChange = onReportBudgetChange;
  window.exportExpenseReportToPDF = exportReportToPDF;
  window.exportExpenseReportToCSV = exportReportToCSV;
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
    refreshReportLogs();

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

async function exportReportToCSV() {
  if (!lastReportSnapshot) {
    showToast('Generate a report first, then export to CSV.', 'warning');
    return;
  }

  try {
    const expenses = lastReportSnapshot.filteredExpenses || [];
    const csvData = expenses.map(exp => {
      const budget = teamBudgets.find(b => b.id === exp.budget_id);
      let catLabel = 'Unknown';
      if (budget) {
        const catObj = (budget.categories || []).find(c => c.id === exp.budget_category_id);
        if (catObj) catLabel = catObj.category || catObj.name;
      }
      return {
        Date: exp.date,
        Item: exp.item,
        Category: catLabel,
        Budget: budget ? budget.name : 'Unknown',
        Source: getBucketName(exp.bucket_id),
        Amount_Local: exp.local_amount,
        Amount_USD: exp.usd_amount,
        Currency: exp.currency,
        Vendor: exp.vendor || '',
        Submitted_By: exp.submitted_by_name || ''
      };
    });

    const csvStr = convertArrayOfObjectsToCSV(csvData);
    downloadCSV('Expense_Report.csv', csvStr);
  } catch (err) {
    showToast('Failed to generate CSV', 'error');
  }
}

window.exportExpenseReportToCSV = exportReportToCSV;
window.exportExpenseReportToPDF = exportReportToPDF;
