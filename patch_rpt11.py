import sys

file_path = r'C:\Users\dell\Documents\GitHub\KManager-test\src\pages\expense-reports.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update filterDesc in refreshReportLogs
old_desc = """    const filterDesc = Object.entries(log.filters || {}).filter(([k,v])=>v).map(([k,v])=>`${k}:${v}`).join(', ') || 'All';"""

new_desc = """    const filterDesc = Object.entries(log.filters || {}).filter(([k,v])=>v).map(([k,v])=>{
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
    }).join(', ') || 'All';"""
content = content.replace(old_desc, new_desc)

# 2. Add Delete Button
old_actions = """    if (log.status === 'completed' && log.file_url) {
      actions = `<button class="primary small" onclick="window.downloadReportPdf('${log.file_url}')">PDF</button>
                 <button class="secondary small" onclick="window.downloadReportCsv('${log.id}')">CSV</button>`;
    } else if (log.status === 'in_progress') {
      actions = `<button class="danger small" onclick="window.cancelReportLog('${log.id}')">Cancel</button>`;
    }"""

new_actions = """    if (log.status === 'completed' && log.file_url) {
      actions = `<button class="primary small" onclick="window.downloadReportPdf('${log.file_url}')">PDF</button>
                 <button class="secondary small" onclick="window.downloadReportCsv('${log.id}')">CSV</button>
                 <button class="danger small" style="margin-left:8px; padding: 2px 6px;" title="Delete" onclick="window.deleteReportLog('${log.id}')">&times;</button>`;
    } else if (log.status === 'in_progress') {
      actions = `<button class="danger small" onclick="window.cancelReportLog('${log.id}')">Cancel</button>`;
    } else {
      actions = `<button class="danger small" style="margin-left:8px; padding: 2px 6px;" title="Delete" onclick="window.deleteReportLog('${log.id}')">&times;</button>`;
    }"""
content = content.replace(old_actions, new_actions)

# 2.5 Add window.deleteReportLog
old_cancel = """window.cancelReportLog = async function(logId) {
  if(!confirm('Cancel report generation?')) return;
  await supabaseClient.from('report_logs').update({ status: 'failed', error_message: 'Cancelled by user' }).eq('id', logId);
  refreshReportLogs();
};"""

new_cancel = """window.cancelReportLog = async function(logId) {
  if(!confirm('Cancel report generation?')) return;
  await supabaseClient.from('report_logs').update({ status: 'failed', error_message: 'Cancelled by user' }).eq('id', logId);
  refreshReportLogs();
};

window.deleteReportLog = async function(logId) {
  if(!confirm('Are you sure you want to delete this report?')) return;
  await supabaseClient.from('report_logs').update({ is_deleted: true }).eq('id', logId);
  refreshReportLogs();
};"""
content = content.replace(old_cancel, new_cancel)

# 3. Rearrange the form fields
old_html = """            <div class="form-group">
              <label>Budget</label>
              <select id="reportBudget" onchange="window.onReportBudgetChange()">
                <option value="">All Budgets</option>
              </select>
            </div>
            <div class="form-group">
              <label>Category</label>
              <select id="reportCategory" onchange="window.populateReportSubcategories()"><option value="">All Categories</option></select>
            </div>
            <div class="form-group">
              <label>Subcategory</label>
              <select id="reportSubcategory"><option value="">All Subcategories</option></select>
            </div>
            <div class="form-group">
              <label>Payment Source</label>
              <select id="reportSource"><option value="">All Sources</option></select>
            </div>
            <div class="form-group">
              <label>Currency</label>
              <select id="reportCurrency"><option value="">All Currencies</option></select>
            </div>"""

new_html = """            <div class="form-group">
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
            </div>"""
content = content.replace(old_html, new_html)


with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("expense-reports.js tweaks patched")
