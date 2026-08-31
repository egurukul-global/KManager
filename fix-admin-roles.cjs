const fs = require('fs');
let code = fs.readFileSync('src/utils/navPermissions.js', 'utf8');

// Revert isOrgAdmin to NOT include FIH
code = code.replace(
  /return \['admin', 'caoh', 'oh', 'ceo', 'fih'\]\.includes\(state\.user\?\.role\);/,
  "return ['admin', 'caoh', 'oh', 'ceo'].includes(state.user?.role);"
);

// We need to define FINANCE_ADMIN_PAGES and modify ORG_ADMIN_ONLY_PAGES
const targetConst = `const ORG_ADMIN_ONLY_PAGES = new Set([
  'user-mgmt',
  'budget-calendar',
  'category-master',
  'role-assignments'
]);`;

const replacementConst = `const ORG_ADMIN_ONLY_PAGES = new Set([
  'user-mgmt',
  'role-assignments'
]);

const FINANCE_ADMIN_PAGES = new Set([
  'budget-calendar',
  'category-master'
]);`;

code = code.replace(targetConst, replacementConst);

// Modify applyNavPermissions to handle FINANCE_ADMIN_PAGES
const targetCheck = `    if (ORG_ADMIN_ONLY_PAGES.has(page) && !isOrgAdmin() && !isSystemAdmin()) hide = true;`;
const replacementCheck = `    if (ORG_ADMIN_ONLY_PAGES.has(page) && !isOrgAdmin() && !isSystemAdmin()) hide = true;
    if (FINANCE_ADMIN_PAGES.has(page) && !isOrgAdmin() && !isSystemAdmin() && String(state.user?.role || '').toLowerCase() !== 'fih') hide = true;`;

code = code.replace(targetCheck, replacementCheck);

fs.writeFileSync('src/utils/navPermissions.js', code, 'utf8');
