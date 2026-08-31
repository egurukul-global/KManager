const fs = require('fs');
let code = fs.readFileSync('src/pages/manager-expenses.js', 'utf8');
code = code.replace(
  /const isGlobal = \['admin', 'cao', 'caoh', 'ceo', 'oh'\]\.includes/, 
  "const isGlobal = ['admin', 'cao', 'caoh', 'ceo', 'oh', 'fih', 'fip', 'fin'].includes"
);
fs.writeFileSync('src/pages/manager-expenses.js', code);
