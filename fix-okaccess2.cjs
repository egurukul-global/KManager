const fs = require('fs');
let code = fs.readFileSync('src/utils/okAccess.js', 'utf8');
const lines = code.split('\n');

const start = lines.findIndex(l => l.includes('export function hasMenuAccess(appCode, menuKey)'));
const end = lines.findIndex((l, i) => i > start && l.includes('}'));

const repl = `import { hasAnyGlobalFinanceRole } from './appRoles.js';

export function hasMenuAccess(appCode, menuKey) {
  if (!hasAppAccess(appCode)) return false;
  
  if (state.isOkAdmin || state.user?.role === 'admin' || (state.okAppAdmins && state.okAppAdmins.includes(appCode))) return true;

  if (appCode === 'finance' && hasAnyGlobalFinanceRole()) {
    return true;
  }

  const menus = state.okMenus || [];
  if (!menus.length) return true;
  return menus.some(m => m.app_code === appCode && m.menu_key === menuKey && m.enabled !== false);
}`;

lines.splice(start, end - start + 1, repl);

code = lines.join('\n');

// Move the import to the top
if (code.includes("import { hasAnyGlobalFinanceRole }")) {
  code = code.replace("import { hasAnyGlobalFinanceRole } from './appRoles.js';\n\n", "");
  code = "import { hasAnyGlobalFinanceRole } from './appRoles.js';\n" + code;
}

fs.writeFileSync('src/utils/okAccess.js', code);
