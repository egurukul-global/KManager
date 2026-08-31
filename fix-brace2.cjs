const fs = require('fs');
let code = fs.readFileSync('src/pages/manager-finance.js', 'utf8');
const lines = code.split('\n');
lines.splice(211, 2); // Remove lines 212 and 213 (0-indexed 211 and 212)
code = lines.join('\n');
fs.writeFileSync('src/pages/manager-finance.js', code);
