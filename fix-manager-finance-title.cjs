const fs = require('fs');
let code = fs.readFileSync('src/pages/manager-finance.js', 'utf8');

code = code.replace(/<h1 class="page-title">Finance Management<\/h1>/g, '<h1 class="page-title">Receivables</h1>');

fs.writeFileSync('src/pages/manager-finance.js', code);
