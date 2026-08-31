const fs = require('fs');
let code = fs.readFileSync('src/pages/expense-reports.js', 'utf8');

const targetStr = `const docDefinition = await buildReportPdfDefinition({
      teamName: getReportTeamName(state),
      filtersDescription: buildReportFilterDescription(filters, budget, getBucketName),
      snapshot: snapshot
    });`;

const replacementStr = `const docDefinition = await buildReportPdfDefinition({
      teamName: getReportTeamName(state),
      filtersDescription: buildReportFilterDescription(filters, budget, getBucketName),
      ...snapshot,
      teamCategories,
      teamBuckets,
      getBucketName,
      getBudgetName,
      teamBudgets
    });`;

if (code.includes(targetStr)) {
  code = code.replace(targetStr, replacementStr);
  fs.writeFileSync('src/pages/expense-reports.js', code, 'utf8');
  console.log('Fixed buildReportPdfDefinition arguments');
} else {
  console.log('Target string not found');
}
