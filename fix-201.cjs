const fs = require('fs');
let code = fs.readFileSync('src/utils/navPermissions.js', 'utf8');

code = code.replace(
  "if (FINANCE_PAGES.has(page) && state.currentTeam?.has_budget_access === false) hide = true;",
  "if (FINANCE_PAGES.has(page) && state.currentTeam?.has_budget_access === false && page !== 'manager-finance') hide = true;"
);

fs.writeFileSync('src/utils/navPermissions.js', code, 'utf8');
console.log('Fixed line 201');
