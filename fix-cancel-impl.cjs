const fs = require('fs');
let code = fs.readFileSync('src/pages/expense-reports.js', 'utf8');

const targetStr = `export async function cancelReportLog(logId) {
  showToast('Cancel log not fully implemented yet.', 'info');
}`;

const replacementStr = `export async function cancelReportLog(logId) {
  if (!confirm('Cancel this report generation?')) return;
  try {
    await sbUpdate('report_logs', logId, { status: 'failed', updated_at: new Date().toISOString() });
    showToast('Report cancelled', 'info');
    refreshReportLogs();
  } catch (err) {
    showToast('Failed to cancel report', 'error');
  }
}`;

if (code.includes(targetStr)) {
  code = code.replace(targetStr, replacementStr);
  fs.writeFileSync('src/pages/expense-reports.js', code, 'utf8');
  console.log('Replaced cancelReportLog');
} else {
  console.log('Target mock function not found');
}
