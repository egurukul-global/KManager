const fs = require('fs');
let code = fs.readFileSync('src/utils/navPermissions.js', 'utf8');

// Fix OTM override
code = code.replace(
  "if ((page === 'manager-finance' || page === 'transfer') && isFin) { /* let it show */ } else { hide = true; }",
  "if ((page === 'manager-finance' || page === 'transfer' || page === 'manager-expenses') && isFin) { /* let it show */ } else { hide = true; }"
);

// Fix VIEW override (it occurs again for viewOnly)
code = code.replace(
  "if ((page === 'manager-finance' || page === 'transfer') && isFin) { /* let it show */ } else { hide = true; }",
  "if ((page === 'manager-finance' || page === 'transfer' || page === 'manager-expenses') && isFin) { /* let it show */ } else { hide = true; }"
);

// Fix sectionPages
code = code.replace(
  "financials: ['financial-status', 'manager-finance', 'reconcile', 'reconciliation-overview', 'reconciliation-approval'],",
  "financials: ['financial-status', 'manager-finance', 'manager-expenses', 'reconcile', 'reconciliation-overview', 'reconciliation-approval'],"
);

fs.writeFileSync('src/utils/navPermissions.js', code);
