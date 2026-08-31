const fs = require('fs');
let code = fs.readFileSync('src/pages/expenses.js', 'utf8');
code = code.replace(/async function hydrateReceiptCells\(\) \{/g, 'window.hydrateReceiptCells = async function() {');
fs.writeFileSync('src/pages/expenses.js', code);
