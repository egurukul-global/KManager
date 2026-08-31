const fs = require('fs');
let code = fs.readFileSync('src/utils/okAccess.js', 'utf8');

const regex = /export function hasMenuAccess\(appCode, menuKey\) \{\s*if \(\!hasAppAccess\(appCode\)\) return false;\s*const globalRoles = \['admin', 'fin', 'fip', 'oh', 'caoh', 'cao', 'ceo'\];/;
const newLogic = `export function hasMenuAccess(appCode, menuKey) {
  if (!hasAppAccess(appCode)) return false;
  const globalRoles = ['admin', 'fin', 'fip', 'oh', 'caoh', 'cao', 'ceo', 'fih'];`;

code = code.replace(regex, newLogic);
fs.writeFileSync('src/utils/okAccess.js', code);
