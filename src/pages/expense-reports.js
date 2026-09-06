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
              <label>Payment Source</label>
              <select id="reportSource"><option value="">All Sources</option></select>
            </div>
            <div class="form-group">
              <label>Currency</label>
              <select id="reportCurrency"><option value="">All Currencies</option></select>
            </div>
            <div class="form-group">
              <label>Category</label>
              <select id="reportCategory" onchange="window.populateReportSubcategories()"><option value="">All Categories</option></select>
            </div>
            <div class="form-group">
              <label>Subcategory</label>
              <select id="reportSubcategory"><option value="">All Subcategories</option></select>
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
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; flex-wrap: wrap; gap: 10px;">
          <h2 style="margin: 0;">Reports Log</h2>
          <div class="search-box" style="flex: 1; max-width: 300px;">
            <input type="text" id="reportLogsSearch" placeholder="Search by name or budget..." oninput="window.refreshReportLogs()" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px;">
          </div>
        </div>
        <div class="table-container">
          <table class="table-stack-mobile">
            <thead>
              <tr>
                <th>Date</th>
                <th>Report Name</th>
                <th>Filters</th>
                <th style="text-align:center;">Status</th>
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
    refreshReportLogs();
  }
}

export async function initExpenseReportsPage() {
  window.promptAndGenerateExpenseReport = promptAndGenerateExpenseReport;
  window.resetExpenseReportFilters = resetExpenseReportFilters;
  window.onReportBudgetChange = onReportBudgetChange;
  window.exportExpenseReportToPDF = exportReportToPDF;
  window.exportExpenseReportToCSV = exportReportToCSV;
  window.switchReportsTab = switchReportsTab;
  window.populateReportSubcategories = populateReportSubcategories;
  window.downloadReportPdf = downloadReportPdf;
  window.downloadReportCsv = downloadReportCsv;
  window.cancelReportLog = cancelReportLog;
  
  

  const teamId = state.currentTeam?.team_id;
  if (!teamId) return;

  try {
    const [bucketsRes, budgetsRes, expensesRes, incomeRes, attachmentsRes] = await Promise.all([
      sbSelect('buckets', { teamId, orderBy: 'name', ascending: true }),
      sbSelect('budget_plans', { teamId, orderBy: 'name', ascending: true }),
      
      sbSelect('expenses', { teamId, orderBy: 'date', ascending: false }),
      sbSelect('income', { teamId, orderBy: 'date', ascending: false }),
      sbSelect('expense_attachments', { teamId })
    ]);

    teamBuckets = (bucketsRes.data || []).filter(b => !b.is_deleted);
    teamBudgets = (budgetsRes.data || []).filter(b => !b.is_deleted).map(normalizeBudget);
    
    try {
      const catModule = await import('../utils/categoryMaster.js');
      teamCategories = await catModule.loadCategoryMaster() || [];
    } catch (e) {
      console.error(e);
      teamCategories = [];
    }

    teamExpenses = (expensesRes.data || []).filter(e => !e.is_deleted);
    teamIncome = (incomeRes.data || []).filter(i => !i.is_deleted);
    teamAttachments = (attachmentsRes.data || []).filter(a => !a.is_deleted);

    populateReportFilters();
    // Default start values
    
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
  const catSelect = document.getElementById('reportCategory');
  if (!catSelect) return;
  catSelect.innerHTML = '<option value="">All Categories</option>';
  teamCategories.forEach(c => {
    catSelect.innerHTML += `<option value="${c.id}">${c.name}</option>`;
  });
  populateReportSubcategories();
}

function populateReportSubcategories() {
  const catId = document.getElementById('reportCategory')?.value;
  const subSelect = document.getElementById('reportSubcategory');
  if (!subSelect) return;
  subSelect.innerHTML = '<option value="">All Subcategories</option>';
  if (catId) {
    const cat = teamCategories.find(c => c.id === catId);
    if (cat && cat.subcategories) {
      cat.subcategories.forEach(s => {
        subSelect.innerHTML += `<option value="${s.id}">${s.name}</option>`;
      });
    }
  }
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
  ['reportBudget', 'reportCategory', 'reportSubcategory', 'reportSource', 'reportCurrency'].forEach(id => {
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
    if (category && e.category_id !== category) return false;
    if (filters.subcategoryId && e.subcategory_id !== filters.subcategoryId) return false;
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
        <div class="form-group" style="margin-bottom: 15px;">
          <label style="font-weight:bold;">Report Name</label>
          <input type="text" id="rptSec_reportName" value="Expense Report" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px;">
        </div>
        <p class="report-sections-hint">Choose what to include in this report.</p>
        <div class="report-sections-list">
          <label class="report-section-check"><input type="checkbox" id="rptSec_expenseDetail" checked> Expense Detail</label>
          <label class="report-section-check"><input type="checkbox" id="rptSec_categorySummary" checked> Category Summary</label>
          <label class="report-section-check"><input type="checkbox" id="rptSec_subcategorySummary"> Subcategory Summary (Detailed)</label>
          <label class="report-section-check"><input type="checkbox" id="rptSec_incomeSummary" checked> Income Summary</label>
          <label class="report-section-check"><input type="checkbox" id="rptSec_incomeDetail" checked> Income Detail</label>
          <label class="report-section-check"><input type="checkbox" id="rptSec_budgetAllocations" checked> Budget Allocations</label>
          <label class="report-section-check"><input type="checkbox" id="rptSec_financialSummary" checked> Financial Summary</label>
        </div>
        <div style="margin-top: 15px; margin-bottom: 20px;">
          <label style="font-weight:bold;display:block;margin-bottom:8px;">Receipt Attachments (PDF Export Only):</label>
          <label style="display:block; margin-bottom:5px;"><input type="radio" name="rptSec_receiptStyle" value="link" checked> Include as clickable links</label>
          <label style="display:block;"><input type="radio" name="rptSec_receiptStyle" value="embed"> Embed directly in PDF Annexure</label>
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
        subcategorySummary: modal.querySelector('#rptSec_subcategorySummary').checked,
        incomeSummary: modal.querySelector('#rptSec_incomeSummary').checked,
        incomeDetail: modal.querySelector('#rptSec_incomeDetail').checked,
        budgetAllocations: modal.querySelector('#rptSec_budgetAllocations').checked,
        financialSummary: modal.querySelector('#rptSec_financialSummary').checked,
        receiptStyle: modal.querySelector('input[name="rptSec_receiptStyle"]:checked').value,
        reportName: modal.querySelector('#rptSec_reportName').value.trim()
      };
      // Ignore reportName for validation of "at least one section"
      const { reportName, ...sectionsForVal } = sections;
      if (!Object.values(sectionsForVal).some(Boolean)) {
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
  const subcategoryId = document.getElementById('reportSubcategory')?.value || '';
  const sourceId = document.getElementById('reportSource')?.value || '';
  const currency = document.getElementById('reportCurrency')?.value || '';
  const filters = { start, end, budgetId, category, subcategoryId, sourceId, currency };

  const logId = crypto.randomUUID();
  const teamId = state.currentTeam?.team_id;
  if (!teamId) return;
  const now = new Date().toISOString();

  showToast('Generating report in background...', 'info');

  lastReportSnapshot = {
    filters,
    sections,
    filteredExpenses: filterExpenses(filters),
    filteredIncome: filterIncomeByDates(filters)
  };

  const resultsEl = document.getElementById('expenseReportResults');
  if (resultsEl) {
    if (lastReportSnapshot.filteredExpenses.length === 0) {
      resultsEl.innerHTML = '<p style="padding: 20px; text-align: center; color: var(--text-secondary);">No expenses found for these filters.</p>';
    } else {
      let html = '<table class="table-stack-mobile" style="margin-top: 15px;"><thead><tr><th>Date</th><th>Item</th><th>Category</th><th>Local Amount</th><th>USD Amount</th></tr></thead><tbody>';
      lastReportSnapshot.filteredExpenses.forEach(exp => {
        let catLabel = 'Unknown';
        if (teamCategories && exp.category_id) {
            const cat = teamCategories.find(c => c.id === exp.category_id);
            catLabel = cat ? cat.name : (exp.vendor_info || 'Unknown');
        } else {
            catLabel = exp.vendor_info || 'Unknown';
        }
        
        html += `<tr>
          <td>${exp.date}</td>
          <td>${exp.item}</td>
          <td>${catLabel}</td>
          <td>${exp.local_amount} ${exp.currency}</td>
          <td>$${exp.usd_amount}</td>
        </tr>`;
      });
      html += '</tbody></table>';
      resultsEl.innerHTML = html;
    }
  }

  showToast('Report generated successfully', 'success');

  // Background process logging
  if (teamId) {
    const enhancedFilters = { ...filters, reportName: sections.reportName };
    await sbInsert('report_logs', {
      id: logId,
      team_id: teamId,
      budget_id: budgetId || null,
      filters: enhancedFilters,
      sections,
      status: 'in_progress',
      created_by: state.user.id,
      created_at: now,
      updated_at: now
    });
    switchReportsTab('logs');
    refreshReportLogs();
    processReportGenerationInBg(logId, filters, sections);
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
          const resultExp = { ...exp, receipts_resolved_urls: resolvedUrls };
          if (lastReportSnapshot.sections && lastReportSnapshot.sections.receiptStyle === 'embed') {
            resultExp.receipt_images = await fetchAndEmbedReceipts(resolvedUrls);
          }
          return resultExp;
        } catch {
          return exp;
        }
      })
    );

    exportExpenseReportToPdf({
      ...lastReportSnapshot,
      filteredExpenses: resolvedExpenses,
      getBucketName,
      getBudgetName,
      teamName: getTeamName()
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


async function refreshReportLogs() {
  const teamId = state.currentTeam?.team_id;
  if (!teamId) return;
  const tbody = document.querySelector('#tabContentLogs tbody');
  if (!tbody) return;
  const searchQ = (document.getElementById('reportLogsSearch')?.value || '').toLowerCase();
  
  const res = await supabaseClient.from('report_logs').select('*').eq('team_id', teamId).eq('is_deleted', false).order('created_at', { ascending: false }).limit(50);
  if (res.error) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:red;">Error loading logs</td></tr>';
    return;
  }
  const logs = res.data || [];
  if (!logs.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No reports found.</td></tr>';
    return;
  }
  
  let filteredLogs = logs;
  
  // Format filters string beforehand so we can search against it
  filteredLogs = filteredLogs.map(log => {
    const rName = log.name || (log.filters && log.filters.reportName) || '';
    let bName = '';
    const filterDesc = Object.entries(log.filters || {}).filter(([k,v])=>v && k !== 'reportName').map(([k,v])=>{
      if (k === 'budgetId') {
        const b = teamBudgets.find(b => b.id === v);
        if (b) bName = b.name;
        return `Budget: ${b ? b.name : v}`;
      }
      if (k === 'category') {
        const c = teamCategories.find(c => c.id === v);
        return `Category: ${c ? c.name : v}`;
      }
      if (k === 'subcategoryId') {
        let name = v;
        for (const c of teamCategories) {
          const s = (c.subcategories || []).find(sub => sub.id === v);
          if (s) { name = s.name; break; }
        }
        return `Subcategory: ${name}`;
      }
      return `${k}:${v}`;
    }).join(', ') || 'All';
    return { ...log, _rName: rName, _bName: bName, _filterDesc: filterDesc };
  });

  if (searchQ) {
    filteredLogs = filteredLogs.filter(log => 
      (log._rName && log._rName.toLowerCase().includes(searchQ)) ||
      (log._bName && log._bName.toLowerCase().includes(searchQ)) ||
      (log._filterDesc && log._filterDesc.toLowerCase().includes(searchQ))
    );
  }

  if (!filteredLogs.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No reports found matching criteria.</td></tr>';
    return;
  }

  tbody.innerHTML = filteredLogs.map(log => {
    let statusPill = '';
    if (log.status === 'completed') statusPill = '<span style="color:var(--success); font-size:1.2rem; font-weight:bold;" title="Completed">&#10003;</span>';
    else if (log.status === 'failed') statusPill = `<span style="color:var(--danger); font-size:1.2rem; font-weight:bold; cursor:help;" title="${log.error_message || 'Failed'}">&#10068;</span>`;
    else statusPill = '<span style="color:var(--info); font-size:1.2rem; font-weight:bold;" title="Running...">&#8987;</span>';
    
    let actions = '';
    if (log.status === 'completed' && log.file_url) {
      actions = `<button class="primary small" onclick="window.downloadReportPdf('${log.file_url}')">PDF</button>
                 <button class="secondary small" onclick="window.downloadReportCsv('${log.id}')">CSV</button>
                 <button class="danger small" style="margin-left:8px; padding: 2px 6px;" title="Delete" onclick="window.deleteReportLog('${log.id}')">&times;</button>`;
    } else if (log.status === 'in_progress') {
      actions = `<button class="danger small" onclick="window.cancelReportLog('${log.id}')">Cancel</button>`;
    } else {
      actions = `<button class="danger small" style="margin-left:8px; padding: 2px 6px;" title="Delete" onclick="window.deleteReportLog('${log.id}')">&times;</button>`;
    }
    
    const d = new Date(log.created_at).toLocaleString();
    return `<tr>
      <td style="white-space: nowrap;">${d}</td>
      <td><strong>${log._rName || '-'}</strong></td>
      <td style="font-size: 0.85em; color: #555;">${log._filterDesc}</td>
      <td style="text-align:center;">${statusPill}</td>
      <td style="white-space: nowrap; display:flex; gap:4px;">${actions}</td>
    </tr>`;
  }).join('');
}

window.downloadReportPdf = async function(fileUrl) {
  try {
    const url = await resolveReceiptViewUrl(fileUrl);
    window.open(url, '_blank');
  } catch(err) {
    showToast('Could not open PDF', 'error');
  }
};

window.downloadReportCsv = async function(logId) {
  const teamId = state.currentTeam?.team_id;
  const logRes = await supabaseClient.from('report_logs').select('filters').eq('id', logId).single();
  if (!logRes.data) return showToast('Log not found', 'error');
  const filters = logRes.data.filters || {};
  
  const expRes = await sbSelect('expenses', { teamId });
  const exps = (expRes.data||[]).filter(e => !e.is_deleted);
  
  const filtered = exps.filter(e => {
    if (filters.start && e.date < filters.start) return false;
    if (filters.end && e.date > filters.end) return false;
    if (filters.budgetId && e.budget_id !== filters.budgetId) return false;
    if (filters.sourceId && e.bucket_id !== filters.sourceId) return false;
    if (filters.currency && e.currency !== filters.currency) return false;
    if (filters.category && e.category_id !== filters.category) return false;
    if (filters.subcategoryId && e.subcategory_id !== filters.subcategoryId) return false;
    return true;
  });
  
  const csvData = filtered.map(exp => ({
    Date: exp.date,
    Item: exp.item,
    Amount_Local: exp.local_amount,
    Amount_USD: exp.usd_amount,
    Currency: exp.currency
  }));
  const csvStr = convertArrayOfObjectsToCSV(csvData);
  downloadCSV('Expense_Report.csv', csvStr);
};

window.cancelReportLog = async function(logId) {
  showConfirm('Cancel report generation?', async () => {
    await supabaseClient.from('report_logs').update({ status: 'failed', error_message: 'Cancelled by user' }).eq('id', logId);
    refreshReportLogs();
  });
};

window.deleteReportLog = async function(logId) {
  showConfirm('Are you sure you want to delete this report?', async () => {
    await supabaseClient.from('report_logs').update({ is_deleted: true }).eq('id', logId);
    refreshReportLogs();
  });
};

async function processReportGenerationInBg(logId, filters, sections) {
  try {
    const pdfLib = window.pdfMake;
    if(!pdfLib) throw new Error("pdfMake not loaded");
    
    // Build PDF
    let filteredExpenses = filterExpenses(filters);
    
    // Resolve URLs
    filteredExpenses = await Promise.all(
      filteredExpenses.map(async (exp) => {
        const keys = [exp.receipt_url].filter(Boolean);
        const childAttachments = (teamAttachments || []).filter(a => a.expense_id === exp.id && !a.is_deleted).map(a => a.file_url);
        const allKeys = [...new Set([...keys, ...childAttachments])];
        if (!allKeys.length) return exp;
        try {
          const resolvedUrls = await Promise.all(allKeys.map(async (key) => {
            if (isExternalReceiptUrl(key)) return key;
            return await resolveReceiptViewUrl(key);
          }));
          const resultExp = { ...exp, receipts_resolved_urls: resolvedUrls };
          if (lastReportSnapshot.sections && lastReportSnapshot.sections.receiptStyle === 'embed') {
            resultExp.receipt_images = await fetchAndEmbedReceipts(resolvedUrls);
          }
          return resultExp;
        } catch {
          return exp;
        }
      })
    );

    const budget = filters.budgetId ? teamBudgets.find(b => b.id === filters.budgetId) : null;
    const docDef = buildReportPdfDefinition({
      filters,
      sections,
      filteredExpenses,
      filteredIncome: filterIncomeByDates(filters),
      budget,
      getBucketName,
      getBudgetName,
      teamId: state.currentTeam?.team_id,
      teamCategories,
      teamName: getTeamName()
    });
    
    pdfLib.createPdf(docDef).getBlob(async (blob) => {
      try {
        const fileUrl = await uploadReportPdf(blob, `report_${logId}.pdf`);
        await supabaseClient.from('report_logs').update({ status: 'completed', file_url: fileUrl }).eq('id', logId);
        refreshReportLogs();
      } catch(err) {
        await supabaseClient.from('report_logs').update({ status: 'failed', error_message: err.message }).eq('id', logId);
        refreshReportLogs();
      }
    });
  } catch(err) {
    await supabaseClient.from('report_logs').update({ status: 'failed', error_message: err.message }).eq('id', logId);
    refreshReportLogs();
  }
}

async function fetchAndEmbedReceipts(resolvedUrls) {
  const images = [];
  for (const url of resolvedUrls) {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      
      if (blob.type === 'application/pdf') {
        const arrayBuffer = await blob.arrayBuffer();
        const base64s = await convertPdfToImages(arrayBuffer);
        images.push(...base64s);
      } else if (blob.type.startsWith('image/')) {
        const reader = new FileReader();
        const base64 = await new Promise(resolve => {
           reader.onloadend = () => resolve(reader.result);
           reader.readAsDataURL(blob);
        });
        images.push(base64);
      }
    } catch (e) {
      console.error('Failed to embed receipt', e);
    }
  }
  return images;
}
