const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');

// 1. Add import
if (!code.includes('manager-expenses.js')) {
  code = code.replace(/import \{ getManagerFinancePage \} from '\.\/pages\/manager-finance\.js';/, "import { getManagerFinancePage } from './pages/manager-finance.js';\nimport { getManagerExpensesPage, initManagerExpensesPage } from './pages/manager-expenses.js';");
}

// 2. Change route definition mapping 'expense-manager' in manager context
code = code.replace(/'expense-manager': \{ html: getExpenseManagerPage, init: initExpenseManagerPage \},/, "'expense-manager': { html: getExpenseManagerPage, init: initExpenseManagerPage },\n    'manager-expenses': { html: getManagerExpensesPage, init: initManagerExpensesPage },");

// 3. Update the view mapping
// Wait, currently 'expense-manager' maps to 'expenses' page title maybe? No, the DOM data-page is 'expense-manager'.
// I should just change the data-page attribute for the manager menu.
code = code.replace(/<div class="nav-subitem" data-page="expense-manager" onclick="window\.showPage\('expense-manager'\)">Expense Manager<\/div>/, `<div class="nav-subitem" data-page="manager-expenses" onclick="window.showPage('manager-expenses')">Expense Manager</div>`);

// 4. Update page titles map
code = code.replace(/'expense-manager': 'expenses',/, "'expense-manager': 'expenses',\n  'manager-expenses': 'Manager Expenses',");

fs.writeFileSync('src/main.js', code);
