import sys

file_path = r'C:\Users\dell\Documents\GitHub\KManager-test\src\pages\expense-reports.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Fix switchReportsTab
old_switch = """    btnGen.classList.remove('active');
    btnGen.style.fontWeight = 'normal';
    btnGen.style.borderBottom = 'none';
    btnGen.style.color = 'var(--text-secondary)';

    tabLogs.style.display = 'block';
    tabGen.style.display = 'none';
  }
}"""

new_switch = """    btnGen.classList.remove('active');
    btnGen.style.fontWeight = 'normal';
    btnGen.style.borderBottom = 'none';
    btnGen.style.color = 'var(--text-secondary)';

    tabLogs.style.display = 'block';
    tabGen.style.display = 'none';
    refreshReportLogs();
  }
}"""
content = content.replace(old_switch, new_switch)

# 2. Add Name input to Modal
old_modal_title = """        <h2>Report Sections</h2>
        <p class="report-sections-hint">Choose what to include in this report.</p>"""

new_modal_title = """        <h2>Report Sections</h2>
        <div class="form-group" style="margin-bottom: 15px;">
          <label style="font-weight:bold;">Report Name (Optional)</label>
          <input type="text" id="rptSec_reportName" placeholder="e.g. Q3 Executive Summary" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px;">
        </div>
        <p class="report-sections-hint">Choose what to include in this report.</p>"""
content = content.replace(old_modal_title, new_modal_title)

# 3. Extract Name from Modal
old_sections = """        subcategorySummary: modal.querySelector('#rptSec_subcategorySummary').checked,
        incomeSummary: modal.querySelector('#rptSec_incomeSummary').checked,
        incomeDetail: modal.querySelector('#rptSec_incomeDetail').checked,
        budgetAllocations: modal.querySelector('#rptSec_budgetAllocations').checked,
        financialSummary: modal.querySelector('#rptSec_financialSummary').checked,
        receiptStyle: modal.querySelector('input[name="rptSec_receiptStyle"]:checked').value
      };
      close(sections);"""

new_sections = """        subcategorySummary: modal.querySelector('#rptSec_subcategorySummary').checked,
        incomeSummary: modal.querySelector('#rptSec_incomeSummary').checked,
        incomeDetail: modal.querySelector('#rptSec_incomeDetail').checked,
        budgetAllocations: modal.querySelector('#rptSec_budgetAllocations').checked,
        financialSummary: modal.querySelector('#rptSec_financialSummary').checked,
        receiptStyle: modal.querySelector('input[name="rptSec_receiptStyle"]:checked').value,
        reportName: modal.querySelector('#rptSec_reportName').value.trim()
      };
      close(sections);"""
content = content.replace(old_sections, new_sections)

# 4. Save name to DB in processReportGenerationInBg / DB insertion
old_insert = """    const { data: logRes, error: logErr } = await supabaseClient.from('report_logs').insert({
      id: logId,
      team_id: teamId,
      budget_id: budgetId || null,
      filters,
      sections,
      status: 'in_progress',
      created_by: state.user.id,
      created_at: now,
      updated_at: now
    });"""

new_insert = """    // We'll store reportName in filters so we don't strictly require a schema migration,
    // but we also pass it to the name column if it exists.
    const enhancedFilters = { ...filters, reportName: sections.reportName };
    const { data: logRes, error: logErr } = await supabaseClient.from('report_logs').insert({
      id: logId,
      team_id: teamId,
      budget_id: budgetId || null,
      filters: enhancedFilters,
      sections,
      name: sections.reportName || null,
      status: 'in_progress',
      created_by: state.user.id,
      created_at: now,
      updated_at: now
    });"""
content = content.replace(old_insert, new_insert)

# 5. Fix Delete Button confirm
old_delete = """window.deleteReportLog = async function(logId) {
  if(!confirm('Are you sure you want to delete this report?')) return;
  await supabaseClient.from('report_logs').update({ is_deleted: true }).eq('id', logId);
  refreshReportLogs();
};"""

new_delete = """window.deleteReportLog = async function(logId) {
  showConfirm('Are you sure you want to delete this report?', async () => {
    await supabaseClient.from('report_logs').update({ is_deleted: true }).eq('id', logId);
    refreshReportLogs();
  });
};"""
content = content.replace(old_delete, new_delete)

# 6. Add Search filter to Reports Log tab
old_tabLogs = """    <!-- Logs Tab Content -->
    <div id="tabContentLogs" class="tab-content" style="display: none;">
      <div class="card">
        <h2>Reports Log</h2>
        <div class="table-container">"""

new_tabLogs = """    <!-- Logs Tab Content -->
    <div id="tabContentLogs" class="tab-content" style="display: none;">
      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; flex-wrap: wrap; gap: 10px;">
          <h2 style="margin: 0;">Reports Log</h2>
          <div class="search-box" style="flex: 1; max-width: 300px;">
            <input type="text" id="reportLogsSearch" placeholder="Search by name or budget..." oninput="window.refreshReportLogs()" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px;">
          </div>
        </div>
        <div class="table-container">"""
content = content.replace(old_tabLogs, new_tabLogs)

# 7. Apply Search Filter in refreshReportLogs and display name
old_refresh = """async function refreshReportLogs() {
  const teamId = state.currentTeam?.team_id;
  if (!teamId) return;
  const tbody = document.querySelector('#tabContentLogs tbody');
  if (!tbody) return;
  
  const res = await supabaseClient.from('report_logs').select('*').eq('team_id', teamId).eq('is_deleted', false).order('created_at', { ascending: false }).limit(20);"""

new_refresh = """async function refreshReportLogs() {
  const teamId = state.currentTeam?.team_id;
  if (!teamId) return;
  const tbody = document.querySelector('#tabContentLogs tbody');
  if (!tbody) return;
  const searchQ = (document.getElementById('reportLogsSearch')?.value || '').toLowerCase();
  
  const res = await supabaseClient.from('report_logs').select('*').eq('team_id', teamId).eq('is_deleted', false).order('created_at', { ascending: false }).limit(50);"""
content = content.replace(old_refresh, new_refresh)

# Update log rows to filter and show name
old_logMap = """  tbody.innerHTML = logs.map(log => {
    let statusPill = '';
    if (log.status === 'completed') statusPill = '<span class="status-pill success">Completed</span>';
    else if (log.status === 'failed') statusPill = '<span class="status-pill danger">Failed</span>';
    else statusPill = '<span class="status-pill info">Running...</span>';
    
    let actions = '';"""

new_logMap = """  let filteredLogs = logs;
  
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
    if (log.status === 'completed') statusPill = '<span class="status-pill success">Completed</span>';
    else if (log.status === 'failed') statusPill = '<span class="status-pill danger">Failed</span>';
    else statusPill = '<span class="status-pill info">Running...</span>';
    
    let actions = '';"""
content = content.replace(old_logMap, new_logMap)

# Replace filterDesc in log row
old_row = """    const d = new Date(log.created_at).toLocaleString();
    const filterDesc = Object.entries(log.filters || {}).filter(([k,v])=>v).map(([k,v])=>{
      if (k === 'budgetId') {
        const b = teamBudgets.find(b => b.id === v);
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
    return `<tr>
      <td>${d}</td>
      <td>${statusPill}</td>
      <td style="font-size: 0.85em; color: #555;">${filterDesc}</td>
      <td style="font-size: 0.85em; color: #d9534f; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${log.error_message || ''}">${log.error_message || ''}</td>
      <td>${actions}</td>
    </tr>`;
  }).join('');
}"""

new_row = """    const d = new Date(log.created_at).toLocaleString();
    let nameHtml = log._rName ? `<strong>${log._rName}</strong><br>` : '';
    return `<tr>
      <td>${d}</td>
      <td>${statusPill}</td>
      <td style="font-size: 0.85em; color: #555;">${nameHtml}${log._filterDesc}</td>
      <td style="font-size: 0.85em; color: #d9534f; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${log.error_message || ''}">${log.error_message || ''}</td>
      <td>${actions}</td>
    </tr>`;
  }).join('');
}"""
content = content.replace(old_row, new_row)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("expense-reports.js log features patched")
