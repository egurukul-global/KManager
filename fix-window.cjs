const fs = require('fs');
let code = fs.readFileSync('src/pages/manager-finance.js', 'utf8');
code = code.replace(/window\.formatUsdDisplay/g, 'formatUsdDisplay');
fs.writeFileSync('src/pages/manager-finance.js', code);
