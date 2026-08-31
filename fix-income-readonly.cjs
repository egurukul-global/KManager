const fs = require('fs');
let code = fs.readFileSync('src/pages/income.js', 'utf8');
code = code.replace(
    'id="incExchangeRate" step="any" min="0.000001" placeholder="95.4" required oninput="window.onIncomeMathFieldsChange()"></div>',
    'id="incExchangeRate" step="any" min="0.000001" placeholder="95.4" required readonly oninput="window.onIncomeMathFieldsChange()"></div>'
);
fs.writeFileSync('src/pages/income.js', code, 'utf8');
console.log('Fixed exchange rate readonly');
