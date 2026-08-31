const fs = require('fs');
let code = fs.readFileSync('src/pages/expense-reports.js', 'utf8');

code = code.replace(/log\.pdf_url/g, 'log.file_url');
code = code.replace(/pdf_url:/g, 'file_url:');

fs.writeFileSync('src/pages/expense-reports.js', code, 'utf8');
console.log('Fixed file_url reference in expense-reports.js');
