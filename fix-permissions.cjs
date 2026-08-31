const fs = require('fs');
let code = fs.readFileSync('src/utils/navPermissions.js', 'utf8');

// The manager view needs 'manager-expenses' in its allowed pages.
code = code.replace(
  /pages: \['profile', 'approval-portal', 'transfer', 'manager-finance', 'expense-manager', 'aggregate-reports'\]/,
  `pages: ['profile', 'approval-portal', 'transfer', 'manager-finance', 'manager-expenses', 'aggregate-reports']`
);

// Add 'manager-expenses' to FINANCE_PAGES so FIH gets it
code = code.replace(
  /'expense-reports', 'my-finances', 'manager-finance', 'category-master', 'budget-calendar'/,
  `'expense-reports', 'my-finances', 'manager-finance', 'manager-expenses', 'category-master', 'budget-calendar'`
);

// Add 'manager-expenses' to OPL_ALLOWED_PAGES or rather ensure it's not hidden (it's not hidden by default, only what is in the list). Wait, Manager View is not for OPL unless they have manager roles. The user said: "for user sri.advait... is OPL team lead... i am not seeing expense manager"
// By restoring `expense-manager` to the HTML, the OPL user will see it now because `expense-manager` is natively in `team.pages` and not in `OPL_HIDDEN_PAGES`.

fs.writeFileSync('src/utils/navPermissions.js', code);
