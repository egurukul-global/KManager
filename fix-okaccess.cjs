const fs = require('fs');
let code = fs.readFileSync('src/utils/okAccess.js', 'utf8');

const regex = /export function hasMenuAccess\(appCode, menuKey\) \{[\s\S]*?return menus\.some.*?;\n\}/;

const repl = `import { hasAnyGlobalFinanceRole } from './appRoles.js';

export function hasMenuAccess(appCode, menuKey) {
  if (!hasAppAccess(appCode)) return false;
  
  if (state.isOkAdmin || state.user?.role === 'admin' || (state.okAppAdmins && state.okAppAdmins.includes(appCode))) return true;

  // If it's finance, and they have ANY global finance app role (FIH, FIN, FIP), give them menu access to everything for now
  if (appCode === 'finance' && hasAnyGlobalFinanceRole()) {
    return true;
  }

  const menus = state.okMenus || [];
  if (!menus.length) return true;
  return menus.some(m => m.app_code === appCode && m.menu_key === menuKey && m.enabled !== false);
}`;

code = code.replace(regex, repl);

fs.writeFileSync('src/utils/okAccess.js', code);
