const fs = require('fs');
let code = fs.readFileSync('src/pages/expense-reports.js', 'utf8');

// 1. Fix filterExpenses
const targetFilter = `const budget = teamBudgets.find(b => b.id === e.budget_id);
      if (!budget) return false;
      const catObj = (budget.categories || []).find(c => c.id === e.category_id);
      const catName = catObj ? (catObj.category || catObj.name) : 'Unknown';
      if (catName !== category) return false;`;

const replacementFilter = `const catName = getExpenseCategoryLabel(e, teamCategories);
      if (catName !== category) return false;`;

if (code.includes(targetFilter)) {
  code = code.replace(targetFilter, replacementFilter);
  console.log('Fixed filterExpenses category matching');
} else {
  console.log('Target string for filterExpenses not found');
}

// 2. Fix downloadReportCsv mapping
const targetCsv = `const budget = teamBudgets.find(b => b.id === exp.budget_id);
      let catLabel = 'Unknown';
      if (budget) {
        const catObj = (budget.categories || []).find(c => c.id === exp.category_id);
        if (catObj) catLabel = catObj.category || catObj.name;
      }`;

const replacementCsv = `const budget = teamBudgets.find(b => b.id === exp.budget_id);
      const catLabel = getExpenseCategoryLabel(exp, teamCategories);`;

if (code.includes(targetCsv)) {
  code = code.replace(targetCsv, replacementCsv);
  console.log('Fixed downloadReportCsv category mapping');
} else {
  console.log('Target string for downloadReportCsv not found');
}

fs.writeFileSync('src/pages/expense-reports.js', code, 'utf8');
