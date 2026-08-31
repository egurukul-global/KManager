const fs = require('fs');
let code = fs.readFileSync('src/pages/expense-reports.js', 'utf8');

const targetStr = `export async function downloadReportPdf(logId) {
  showToast('Download PDF not fully implemented yet.', 'info');
}`;

const replacementStr = `export async function downloadReportPdf(logId) {
  try {
    const { data, error } = await sbSelect('report_logs', { eq: { id: logId } });
    const log = data?.[0];
    if (!log || !log.pdf_url) return showToast('PDF not found', 'error');
    
    const link = document.createElement('a');
    link.href = log.pdf_url;
    link.download = \`Report_\${logId.substring(0,8)}.pdf\`;
    link.click();
  } catch (err) {
    showToast('Failed to download PDF', 'error');
  }
}`;

if (code.includes(targetStr)) {
  code = code.replace(targetStr, replacementStr);
  fs.writeFileSync('src/pages/expense-reports.js', code, 'utf8');
  console.log('Replaced downloadReportPdf');
} else {
  console.log('Target mock function not found');
}
