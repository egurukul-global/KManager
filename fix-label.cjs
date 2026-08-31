const fs = require('fs');

let mainCode = fs.readFileSync('src/main.js', 'utf8');
mainCode = mainCode.replace(
  '<div class="nav-subitem-label">Reconciliation</div>',
  '<div class="nav-subitem-label" data-page="reconcile-label">Reconciliation</div>'
);
fs.writeFileSync('src/main.js', mainCode, 'utf8');

let navCode = fs.readFileSync('src/utils/navPermissions.js', 'utf8');
navCode = navCode.replace(
  `'financial-status', 'reconcile',`,
  `'financial-status', 'reconcile-label', 'reconcile',`
);
navCode = navCode.replace(
  `const NON_FINANCE_PAGES = new Set([`,
  `const NON_FINANCE_PAGES = new Set([\n  'reconcile-label',`
);
fs.writeFileSync('src/utils/navPermissions.js', navCode, 'utf8');
console.log('Fixed reconciliation label leaking');
