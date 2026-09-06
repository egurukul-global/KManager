import sys
import re

file_path = r'C:\Users\dell\Documents\GitHub\KManager-test\src\pages\expense-reports.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. HTML changes
old_html = """            <div class="form-group">
              <label>Category</label>
              <select id="reportCategory"><option value="">All Categories</option></select>
            </div>"""
new_html = """            <div class="form-group">
              <label>Category</label>
              <select id="reportCategory" onchange="window.populateReportSubcategories()"><option value="">All Categories</option></select>
            </div>
            <div class="form-group">
              <label>Subcategory</label>
              <select id="reportSubcategory"><option value="">All Subcategories</option></select>
            </div>"""
content = content.replace(old_html, new_html)

# 2. window bindings
old_bindings = """  window.switchReportsTab = switchReportsTab;"""
new_bindings = """  window.switchReportsTab = switchReportsTab;
  window.populateReportSubcategories = populateReportSubcategories;
  window.downloadReportPdf = downloadReportPdf;
  window.downloadReportCsv = downloadReportCsv;
  window.cancelReportLog = cancelReportLog;"""
content = content.replace(old_bindings, new_bindings)

# 3. populate filters
old_pop = """function populateReportCategories() {
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
}"""

new_pop = """function populateReportCategories() {
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
}"""
content = content.replace(old_pop, new_pop)

# 4. Filter logic
old_filter = """    if (category) {
      const label = getExpenseCategoryLabel(e, teamCategories);
      if (label !== category) return false;
    }"""
new_filter = """    if (category && e.category_id !== category) return false;
    if (filters.subcategoryId && e.subcategory_id !== filters.subcategoryId) return false;"""
content = content.replace(old_filter, new_filter)

old_reset = """  ['reportBudget', 'reportCategory', 'reportSource', 'reportCurrency'].forEach(id => {"""
new_reset = """  ['reportBudget', 'reportCategory', 'reportSubcategory', 'reportSource', 'reportCurrency'].forEach(id => {"""
content = content.replace(old_reset, new_reset)

# 5. promptAndGenerateExpenseReport and background methods
# We will just replace the promptAndGenerateExpenseReport logic and append the bg methods.
old_gen = """  const category = document.getElementById('reportCategory')?.value || '';
  const sourceId = document.getElementById('reportSource')?.value || '';
  const currency = document.getElementById('reportCurrency')?.value || '';
  const filters = { start, end, budgetId, category, sourceId, currency };"""

new_gen = """  const category = document.getElementById('reportCategory')?.value || '';
  const subcategoryId = document.getElementById('reportSubcategory')?.value || '';
  const sourceId = document.getElementById('reportSource')?.value || '';
  const currency = document.getElementById('reportCurrency')?.value || '';
  const filters = { start, end, budgetId, category, subcategoryId, sourceId, currency };"""
content = content.replace(old_gen, new_gen)

bg_code = """

async function refreshReportLogs() {
  const teamId = state.currentTeam?.team_id;
  if (!teamId) return;
  const tbody = document.querySelector('#tabContentLogs tbody');
  if (!tbody) return;
  
  const res = await supabaseClient.from('report_logs').select('*').eq('team_id', teamId).eq('is_deleted', false).order('created_at', { ascending: false }).limit(20);
  if (res.error) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:red;">Error loading logs</td></tr>';
    return;
  }
  const logs = res.data || [];
  if (!logs.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No reports found.</td></tr>';
    return;
  }
  
  tbody.innerHTML = logs.map(log => {
    let statusPill = '';
    if (log.status === 'completed') statusPill = '<span class="status-pill success">Completed</span>';
    else if (log.status === 'failed') statusPill = '<span class="status-pill danger">Failed</span>';
    else statusPill = '<span class="status-pill info">Running...</span>';
    
    let actions = '';
    if (log.status === 'completed' && log.file_url) {
      actions = `<button class="primary small" onclick="window.downloadReportPdf('${log.file_url}')">PDF</button>
                 <button class="secondary small" onclick="window.downloadReportCsv('${log.id}')">CSV</button>`;
    } else if (log.status === 'in_progress') {
      actions = `<button class="danger small" onclick="window.cancelReportLog('${log.id}')">Cancel</button>`;
    }
    
    const d = new Date(log.created_at).toLocaleString();
    const filterDesc = Object.entries(log.filters || {}).filter(([k,v])=>v).map(([k,v])=>`${k}:${v}`).join(', ') || 'All';
    return `<tr>
      <td>${d}</td>
      <td>${filterDesc}</td>
      <td>${statusPill}</td>
      <td style="color:red;font-size:0.85em;">${log.error_message || ''}</td>
      <td style="display:flex;gap:4px;">${actions}</td>
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
  if(!confirm('Cancel report generation?')) return;
  await supabaseClient.from('report_logs').update({ status: 'failed', error_message: 'Cancelled by user' }).eq('id', logId);
  refreshReportLogs();
};

async function processReportGenerationInBg(logId, filters, sections) {
  try {
    const pdfLib = window.pdfMake;
    if(!pdfLib) throw new Error("pdfMake not loaded");
    
    // Build PDF
    const filteredExpenses = filterExpenses(filters);
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
      teamCategories
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
"""

content = content + bg_code

# Also fix promptAndGenerateExpenseReport to do BOTH the inline render AND the bg process
# Wait, I already changed promptAndGenerateExpenseReport to just render inline in the previous fix!
# I need to restore the db insert and tab switch.
inline_render = """  const resultsEl = document.getElementById('expenseReportResults');
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

  showToast('Report generated successfully', 'success');"""

new_inline_render = inline_render + """

  // Background process logging
  const logId = crypto.randomUUID();
  const teamId = state.currentTeam?.team_id;
  if (teamId) {
    const now = new Date().toISOString();
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
    switchReportsTab('logs');
    refreshReportLogs();
    processReportGenerationInBg(logId, filters, sections);
  }"""

content = content.replace(inline_render, new_inline_render)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("expense-reports.js patched successfully")
