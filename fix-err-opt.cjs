const fs = require('fs');
let code = fs.readFileSync('src/pages/manager-finance.js', 'utf8');

code = code.replace(
  '<option value="CLOSED">Reconciled</option>',
  '<option value="CLOSED">Reconciled</option>\n            <option value="ERROR">Error (Negative)</option>'
);

fs.writeFileSync('src/pages/manager-finance.js', code, 'utf8');
console.log('Added ERROR option to dropdown');
