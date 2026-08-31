const fs = require('fs');
let code = fs.readFileSync('src/pages/expenses.js', 'utf8');
const lines = code.split('\n');
const start = lines.findIndex(l => l.includes('id="editExpenseForm"'));
if (start !== -1) {
  for (let i = start; i < start + 30; i++) console.log((i+1) + ': ' + lines[i]);
}
