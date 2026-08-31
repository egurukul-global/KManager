const fs = require('fs');
const lines = fs.readFileSync('src/pages/expense-reports.js', 'utf8').split('\n');
const start = lines.findIndex(l => l.includes('function populateBudgetDropdown'));
if (start !== -1) {
  for (let i = start; i < start + 25; i++) {
    if (lines[i] !== undefined) console.log(String(i + 1) + ': ' + lines[i]);
  }
} else {
  console.log('populateBudgetDropdown not found');
}
