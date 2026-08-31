const fs = require('fs');
let code = fs.readFileSync('src/pages/manager-finance.js', 'utf8');
const lines = code.split('\n');
lines.splice(210, 1, '  }', '}');
code = lines.join('\n');
fs.writeFileSync('src/pages/manager-finance.js', code);
