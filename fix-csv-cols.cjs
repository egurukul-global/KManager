const fs = require('fs');
let code = fs.readFileSync('src/pages/expense-reports.js', 'utf8');

code = code.replace(/Amount_Local:/g, "'Amount (Local)':");
code = code.replace(/Amount_USD:/g, "'Amount (USD)':");
code = code.replace(/Submitted_By:/g, "'Submitted By':");

fs.writeFileSync('src/pages/expense-reports.js', code, 'utf8');
console.log('Fixed CSV column names');
