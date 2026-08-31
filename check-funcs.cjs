const fs = require('fs');
const code = fs.readFileSync('src/pages/expense-reports.js', 'utf8');
const funcs = [
  'promptAndGenerateExpenseReport',
  'resetExpenseReportFilters',
  'onReportBudgetChange',
  'exportReportToPDF',
  'exportReportToCSV',
  'switchReportsTab',
  'downloadReportPdf',
  'cancelReportLog'
];
for (const f of funcs) {
  if (!code.includes('function ' + f)) {
    console.log(f + ' is MISSING');
  } else {
    console.log(f + ' is present');
  }
}
