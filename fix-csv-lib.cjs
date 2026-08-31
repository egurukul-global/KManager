const fs = require('fs');
let code = fs.readFileSync('src/utils/exportCsv.js', 'utf8');

code = code.replace(/return "";/g, 'return `"${val}"`;');

fs.writeFileSync('src/utils/exportCsv.js', code, 'utf8');
console.log('Fixed convertArrayOfObjectsToCSV');
