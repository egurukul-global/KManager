const fs = require('fs');
let code = fs.readFileSync('src/pages/dashboard.js', 'utf8');
code = code.replace(/<h3 id="dashExpenses"(.*?)>(.*?)<\/h3>\s*<p(.*?)>Outflows logged against budgets<\/p>/, '<h3 id="dashBooked"$1>$2</h3>\n          <p$3>Outflows logged against budgets</p>');
fs.writeFileSync('src/pages/dashboard.js', code);
