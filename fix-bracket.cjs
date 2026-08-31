const fs = require('fs');
let code = fs.readFileSync('src/pages/income.js', 'utf8');

code = code.replace(/    \}\);\n  \}/g, '    }');

fs.writeFileSync('src/pages/income.js', code, 'utf8');
