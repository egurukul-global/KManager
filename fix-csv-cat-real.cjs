const fs = require('fs');
let code = fs.readFileSync('src/pages/expense-reports.js', 'utf8');

const targetCsv = `      let catLabel = 'Unknown';
      if (budget) {
        const catObj = (budget.categories || []).find(c => c.id === exp.category_id);
        if (catObj) catLabel = catObj.category || catObj.name;
      }`;

const replacementCsv = `      const catLabel = getExpenseCategoryLabel(exp, teamCategories);`;

if (code.includes(targetCsv)) {
  code = code.replace(targetCsv, replacementCsv);
  console.log('Fixed downloadReportCsv category mapping');
} else {
  // Let's try a regex for a broader match
  const match = code.match(/let catLabel = 'Unknown';[\s\S]*?if \(catObj\) catLabel = catObj\.category \|\| catObj\.name;\s*\}/);
  if (match) {
    code = code.replace(match[0], replacementCsv);
    console.log('Fixed downloadReportCsv category mapping via regex');
  } else {
    console.log('Target string for downloadReportCsv STILL not found');
  }
}

fs.writeFileSync('src/pages/expense-reports.js', code, 'utf8');
