const fs = require('fs');
let code = fs.readFileSync('src/pages/manager-finance.js', 'utf8');

// Undo the first replacement
const injectedCode = `const sumAllocated = filtered.reduce((s, b) => s + (parseFloat(b.allocated_amount) || 0), 0);
  const sumExpenses = filtered.reduce((s, b) => s + (parseFloat(b.expenses_amount) || 0), 0);
  const sumOutstanding = filtered.reduce((s, b) => s + (parseFloat(b.remaining_held_balance) || 0), 0);
  
  const elAlloc = document.getElementById('mgrBlobAllocated');
  if (elAlloc) elAlloc.textContent = '$' + formatUsdDisplay(sumAllocated);
  const elExp = document.getElementById('mgrBlobExpenses');
  if (elExp) elExp.textContent = '$' + formatUsdDisplay(sumExpenses);
  const elOut = document.getElementById('mgrBlobOutstanding');
  if (elOut) elOut.textContent = '$' + formatUsdDisplay(sumOutstanding);

  const tbody = document.getElementById('financeDashboardTableBody');`;

code = code.replace(injectedCode, "const tbody = document.getElementById('financeDashboardTableBody');");

// Inject it properly into renderFinanceTable
const regex2 = /let filtered = cachedReconciliationData;/;
const repl2 = `let filtered = cachedReconciliationData;`;

code = code.replace("const searchQ = (document.getElementById('finSearchInput')?.value || '').toLowerCase();",
`const searchQ = (document.getElementById('finSearchInput')?.value || '').toLowerCase();`); // Just to anchor

const injectPoint = "const tbody = document.getElementById('financeDashboardTableBody');\n  const thead = document.getElementById('financeDashboardTableHead');";
const targetRepl = `const sumAllocated = filtered.reduce((s, b) => s + (parseFloat(b.allocated_amount) || 0), 0);
  const sumExpenses = filtered.reduce((s, b) => s + (parseFloat(b.expenses_amount) || 0), 0);
  const sumOutstanding = filtered.reduce((s, b) => s + (parseFloat(b.remaining_held_balance) || 0), 0);
  
  const elAlloc = document.getElementById('mgrBlobAllocated');
  if (elAlloc) elAlloc.textContent = '$' + formatUsdDisplay(sumAllocated);
  const elExp = document.getElementById('mgrBlobExpenses');
  if (elExp) elExp.textContent = '$' + formatUsdDisplay(sumExpenses);
  const elOut = document.getElementById('mgrBlobOutstanding');
  if (elOut) elOut.textContent = '$' + formatUsdDisplay(sumOutstanding);

  const tbody = document.getElementById('financeDashboardTableBody');
  const thead = document.getElementById('financeDashboardTableHead');`;

code = code.replace(injectPoint, targetRepl);

fs.writeFileSync('src/pages/manager-finance.js', code);
