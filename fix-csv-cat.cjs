const fs = require('fs');
let code = fs.readFileSync('src/pages/expense-reports.js', 'utf8');
code = code.replace(/exp\.budget_category_id/g, 'exp.category_id');
fs.writeFileSync('src/pages/expense-reports.js', code, 'utf8');
console.log('Fixed category mapping in CSV');
