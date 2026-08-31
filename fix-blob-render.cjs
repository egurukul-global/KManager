const fs = require('fs');
let code = fs.readFileSync('src/pages/manager-finance.js', 'utf8');
const lines = code.split('\n');

const logic = `
  const sumAllocated = filtered.reduce((s, b) => s + (parseFloat(b.allocated_amount) || 0), 0);
  const sumExpenses = filtered.reduce((s, b) => s + (parseFloat(b.expenses_amount) || 0), 0);
  const sumOutstanding = filtered.reduce((s, b) => s + (parseFloat(b.remaining_held_balance) || 0), 0);
  
  const elAlloc = document.getElementById('mgrBlobAllocated');
  if (elAlloc) elAlloc.textContent = '$' + window.formatUsdDisplay(sumAllocated);
  const elExp = document.getElementById('mgrBlobExpenses');
  if (elExp) elExp.textContent = '$' + window.formatUsdDisplay(sumExpenses);
  const elOut = document.getElementById('mgrBlobOutstanding');
  if (elOut) elOut.textContent = '$' + window.formatUsdDisplay(sumOutstanding);
`;

lines.splice(308, 0, logic);

code = lines.join('\n');
fs.writeFileSync('src/pages/manager-finance.js', code);
