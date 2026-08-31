const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');

// 1. Fix the Team View's Expense Manager
code = code.replace(
  /<div class="nav-subitem" data-page="manager-expenses" onclick="window\.showPage\('manager-expenses'\)">Expense Manager<\/div>/,
  `<div class="nav-subitem" data-page="expense-manager" onclick="window.showPage('expense-manager')">Expense Manager</div>`
);

// 2. Add the Global Manager's Expenses to Financials
code = code.replace(
  /<div class="nav-subitem" data-page="manager-finance" onclick="window\.showPage\('manager-finance'\)">Receivables<\/div>/,
  `<div class="nav-subitem" data-page="manager-finance" onclick="window.showPage('manager-finance')">Receivables</div>
              <div class="nav-subitem" data-page="manager-expenses" onclick="window.showPage('manager-expenses')">Expenses</div>`
);

fs.writeFileSync('src/main.js', code);
