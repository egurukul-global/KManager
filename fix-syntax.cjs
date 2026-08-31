const fs = require('fs');
let code = fs.readFileSync('src/pages/manager-finance.js', 'utf8');
const lines = code.split('\n');

// Keep only lines 0 to 462
const cleanLines = lines.slice(0, 463);
code = cleanLines.join('\n');
fs.writeFileSync('src/pages/manager-finance.js', code);
