const fs = require('fs');
let code = fs.readFileSync('src/utils/appRoles.js', 'utf8');

const regex = /export function hasAppRoleGlobal\(appCode, roleCode\) \{\s*if \(state\.user\?\.role === 'admin' \|\| state\.user\?\.role === 'ceo'\) return true;\s*if \(!state\.appRoleAssignments\) return false;\s*return state\.appRoleAssignments\.some\(r => r\.app_code === appCode && r\.role_code === roleCode && r\.team_id === null\);\s*\}/;

const repl = `export function hasAppRoleGlobal(appCode, roleCode) {
  if (state.user?.role === 'admin' || state.user?.role === 'ceo') return true;
  
  // Legacy role fallback
  if (appCode === 'finance' && state.user?.role === roleCode) return true;
  
  if (!state.appRoleAssignments) return false;
  return state.appRoleAssignments.some(r => r.app_code === appCode && r.role_code === roleCode && r.team_id === null);
}`;

code = code.replace(regex, repl);
fs.writeFileSync('src/utils/appRoles.js', code);
