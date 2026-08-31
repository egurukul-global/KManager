const fs = require('fs');
let code = fs.readFileSync('src/utils/navPermissions.js', 'utf8');

// Move it from reports to financials
code = code.replace(/reports: \['expense-reports', 'manager-finance', 'my-finances'\],/, 
  "reports: ['expense-reports', 'my-finances'],");

code = code.replace(/financials: \['financial-status', 'reconcile', 'reconciliation-overview', 'reconciliation-approval'\],/,
  "financials: ['financial-status', 'manager-finance', 'reconcile', 'reconciliation-overview', 'reconciliation-approval'],");

fs.writeFileSync('src/utils/navPermissions.js', code, 'utf8');
console.log('Fixed sectionPages in navPermissions.js');
