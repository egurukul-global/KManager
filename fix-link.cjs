const fs = require('fs');
let code = fs.readFileSync('src/pages/income.js', 'utf8');
code = code.replace("window.appNavigate('transfers')", "window.showPage('transfer')");
fs.writeFileSync('src/pages/income.js', code, 'utf8');
