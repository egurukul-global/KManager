const fs = require('fs');
let code = fs.readFileSync('src/pages/manager-finance.js', 'utf8');

const logic = `
  // Update Blobs
  const sumAllocated = filtered.reduce((s, b) => s + (parseFloat(b.allocated_amount) || 0), 0);
  const sumExpenses = filtered.reduce((s, b) => s + (parseFloat(b.expenses_amount) || 0), 0);
  const sumOutstanding = filtered.reduce((s, b) => s + (parseFloat(b.remaining_held_balance) || 0), 0);
  
  import { formatUsdDisplay } from '../utils/currency.js';
  // wait, formatUsdDisplay is imported? Yes.
  document.getElementById('mgrBlobAllocated').textContent = '$' + formatUsdDisplay(sumAllocated);
  document.getElementById('mgrBlobExpenses').textContent = '$' + formatUsdDisplay(sumExpenses);
  document.getElementById('mgrBlobOutstanding').textContent = '$' + formatUsdDisplay(sumOutstanding);
`;

const regex2 = /const tbody = document\.getElementById\('finTableBody'\);/;
code = code.replace(regex2, `const sumAllocated = filtered.reduce((s, b) => s + (parseFloat(b.allocated_amount) || 0), 0);
  const sumExpenses = filtered.reduce((s, b) => s + (parseFloat(b.expenses_amount) || 0), 0);
  const sumOutstanding = filtered.reduce((s, b) => s + (parseFloat(b.remaining_held_balance) || 0), 0);
  
  const elAlloc = document.getElementById('mgrBlobAllocated');
  if (elAlloc) elAlloc.textContent = '$' + formatUsdDisplay(sumAllocated);
  const elExp = document.getElementById('mgrBlobExpenses');
  if (elExp) elExp.textContent = '$' + formatUsdDisplay(sumExpenses);
  const elOut = document.getElementById('mgrBlobOutstanding');
  if (elOut) elOut.textContent = '$' + formatUsdDisplay(sumOutstanding);

  const tbody = document.getElementById('finTableBody');`);

fs.writeFileSync('src/pages/manager-finance.js', code);
