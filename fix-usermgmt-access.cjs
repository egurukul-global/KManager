const fs = require('fs');
let code = fs.readFileSync('src/utils/userMgmtAccess.js', 'utf8');

code = "import { isFinanceGlobalAdmin } from './appRoles.js';\n" + code;
code = code.replace(/export function canManageUsers\(\) \{[\s\S]*?\}/, `export function canManageUsers() {
  return state.user?.role === 'admin' || isOrgAdminUser() || isFinanceGlobalAdmin();
}`);

fs.writeFileSync('src/utils/userMgmtAccess.js', code);
