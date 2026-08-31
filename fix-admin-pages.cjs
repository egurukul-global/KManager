const fs = require('fs');
let code = fs.readFileSync('src/utils/navPermissions.js', 'utf8');

// Replace the ORG_ADMIN_ONLY_PAGES declaration entirely
const regex = /const ORG_ADMIN_ONLY_PAGES = new Set\(\[[\s\S]*?\]\);/;
const replacement = `const ORG_ADMIN_ONLY_PAGES = new Set([
  'user-mgmt',
  'role-assignments'
]);

const FINANCE_ADMIN_PAGES = new Set([
  'budget-calendar',
  'category-master'
]);`;

code = code.replace(regex, replacement);

// Fix the applyNavPermissions logic
const applyRegex = /if \(ORG_ADMIN_ONLY_PAGES\.has\(page\) && !isOrgAdmin\(\) && !isSystemAdmin\(\)\) hide = true;/;
const applyReplacement = `if (ORG_ADMIN_ONLY_PAGES.has(page) && !isOrgAdmin() && !isSystemAdmin()) hide = true;
    if (FINANCE_ADMIN_PAGES.has(page) && !isOrgAdmin() && !isSystemAdmin() && String(state.user?.role || '').toLowerCase() !== 'fih') hide = true;`;

code = code.replace(applyRegex, applyReplacement);

fs.writeFileSync('src/utils/navPermissions.js', code, 'utf8');
console.log("Done");
