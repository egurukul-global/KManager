const fs = require('fs');
let code = fs.readFileSync('src/pages/expenses.js', 'utf8');

code = code.replace(
  '<div class="form-grid-row form-grid-row--filter-dates">',
  '<div class="form-grid-row form-grid-row--filter-dates" style="grid-template-columns: repeat(4, 1fr); width: 100%;">'
);

fs.writeFileSync('src/pages/expenses.js', code);
