const fs = require('fs');
let code = fs.readFileSync('src/pages/expense-reports.js', 'utf8');
code = code.replace(/â€”/g, '—');
fs.writeFileSync('src/pages/expense-reports.js', code, 'utf8');
console.log('Fixed emdash in expense-reports.js');
