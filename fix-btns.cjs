const fs = require('fs');
let code = fs.readFileSync('src/pages/expense-reports.js', 'utf8');

const regex = /let actionHtml = '';[\s\S]*?<td>' \+ actionHtml \+ deleteHtml \+ '<\/td>';/;

const replacementStr = `      let actionHtml = '<div style="display:flex; gap: 8px; align-items:center;">';
      const btnStyle = 'padding: 2px 6px; font-size: 0.8em; line-height: 1.2;';
      
      if (log.status === 'completed' && log.file_url) {
        actionHtml += '<button type="button" class="btn-sm" style="' + btnStyle + '" onclick="window.downloadReportPdf(\\'' + log.id + '\\')">PDF</button>';
        actionHtml += '<button type="button" class="btn-sm secondary" style="' + btnStyle + '" onclick="window.downloadReportCsv(\\'' + log.id + '\\')">CSV</button>';
      } else if (log.status === 'in_progress') {
        actionHtml += '<button type="button" class="btn-sm secondary" style="' + btnStyle + '" onclick="window.cancelReportLog(\\'' + log.id + '\\')">Cancel</button>';
      }
      
      actionHtml += '<button type="button" class="btn-sm danger" style="' + btnStyle + '" onclick="window.deleteReportLog(\\'' + log.id + '\\')">✖</button>';
      actionHtml += '</div>';
      
      const tr = document.createElement('tr');
      tr.innerHTML = '<td>' + new Date(log.created_at).toLocaleString() + '</td>' +
                     '<td>' + (log.budget_id ? getBudgetName(log.budget_id) : 'All Budgets') + '</td>' +
                     '<td>' + statusBadge + '</td>' +
                     '<td>' + actionHtml + '</td>';`;

if (regex.test(code)) {
  code = code.replace(regex, replacementStr);
  fs.writeFileSync('src/pages/expense-reports.js', code, 'utf8');
  console.log('Fixed button alignment');
} else {
  console.log('Regex match failed.');
}
