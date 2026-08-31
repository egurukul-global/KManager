const fs = require('fs');
let code = fs.readFileSync('src/utils/appRoles.js', 'utf8');

const regex = /export function hasAnyGlobalFinanceRole\(\) \{\s*if \(isFinanceGlobalAdmin\(\)\) return true;\s*if \(!state\.appRoleAssignments\) return false;\s*return state\.appRoleAssignments\.some\(r => r\.app_code === 'finance' && r\.team_id === null\);\s*\}/;

const repl = `export function hasAnyGlobalFinanceRole() {
  if (isFinanceGlobalAdmin()) return true;
  
  // Legacy role fallback
  if (['fih', 'fin', 'fip', 'cao', 'oh', 'caoh'].includes(state.user?.role)) return true;
  
  if (!state.appRoleAssignments) return false;
  return state.appRoleAssignments.some(r => r.app_code === 'finance' && r.team_id === null);
}`;

code = code.replace(regex, repl);
fs.writeFileSync('src/utils/appRoles.js', code);
