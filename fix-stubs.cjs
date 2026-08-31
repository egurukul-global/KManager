const fs = require('fs');
let code = fs.readFileSync('src/pages/expense-reports.js', 'utf8');

const stubs = `

export async function downloadReportPdf(logId) {
  showToast('Download PDF not fully implemented yet.', 'info');
}

export async function cancelReportLog(logId) {
  showToast('Cancel log not fully implemented yet.', 'info');
}
`;

code += stubs;

fs.writeFileSync('src/pages/expense-reports.js', code, 'utf8');
console.log('Added stub functions');
