const fs = require('fs');
let code = fs.readFileSync('src/pages/expense-reports.js', 'utf8');

// 1. Remove Filter Criteria column header
code = code.replace('<th>Filter Criteria</th>\n', '');
code = code.replace('colspan="5"', 'colspan="4"');

// 2. Fix refreshReportLogs rendering
const targetRender = `      const tr = document.createElement('tr');
      tr.innerHTML = '<td>' + new Date(log.created_at).toLocaleString() + '</td>' +
                     '<td>' + (log.budget_id ? 'Budget Filtered' : 'All Budgets') + '</td>' +
                     '<td>' + (log.filters ? 'Custom Filters' : 'None') + '</td>' +
                     '<td>' + statusBadge + '</td>' +
                     '<td>' + actionHtml + '</td>';
      tbody.appendChild(tr);`;

const replacementRender = `      let deleteHtml = '<button type="button" class="btn-sm danger" style="margin-left:5px;" onclick="window.deleteReportLog(\\'' + log.id + '\\')">Delete</button>';
      
      const tr = document.createElement('tr');
      tr.innerHTML = '<td>' + new Date(log.created_at).toLocaleString() + '</td>' +
                     '<td>' + (log.budget_id ? getBudgetName(log.budget_id) : 'All Budgets') + '</td>' +
                     '<td>' + statusBadge + '</td>' +
                     '<td>' + actionHtml + deleteHtml + '</td>';
      tbody.appendChild(tr);`;

code = code.replace(targetRender, replacementRender);

// 3. Add deleteReportLog function
const newFunc = `
export async function deleteReportLog(logId) {
  if (!confirm('Are you sure you want to delete this report log?')) return;
  try {
    const { error } = await sbUpdate('report_logs', logId, { is_deleted: true, deleted_at: new Date().toISOString() });
    if (error) throw error;
    showToast('Report log deleted.', 'success');
    refreshReportLogs();
  } catch (err) {
    showToast(err.message || 'Failed to delete report log', 'error');
  }
}
window.deleteReportLog = deleteReportLog;
`;

if (!code.includes('export async function deleteReportLog')) {
  code += newFunc;
}

fs.writeFileSync('src/pages/expense-reports.js', code, 'utf8');
console.log('Fixed report logs table rendering and added delete option');
