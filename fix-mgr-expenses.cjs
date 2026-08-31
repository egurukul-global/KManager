const fs = require('fs');
let code = fs.readFileSync('src/pages/manager-expenses.js', 'utf8');

// Remove is_submitted = true
code = code.replace(/\.eq\('is_submitted', true\)\s*/, '');

fs.writeFileSync('src/pages/manager-expenses.js', code);
