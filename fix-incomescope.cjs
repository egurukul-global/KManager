const fs = require('fs');
let code = fs.readFileSync('src/pages/expense-reports.js', 'utf8');

const targetStr = `const snapshot = {
      filters,
      budget,
      sections,
      filteredExpenses: resolvedExpenses
    };`;

const replacementStr = `const incomeScope = scopeIncomeForReport(teamIncome, filters.budgetId);
    
    const snapshot = {
      filters,
      budget,
      sections,
      filteredExpenses: resolvedExpenses,
      incomeScope
    };`;

if (code.includes(targetStr)) {
  code = code.replace(targetStr, replacementStr);
  fs.writeFileSync('src/pages/expense-reports.js', code, 'utf8');
  console.log('Added incomeScope to snapshot');
} else {
  console.log('Target string not found');
}
