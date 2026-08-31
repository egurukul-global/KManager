const fs = require('fs');
let code = fs.readFileSync('src/utils/navPermissions.js', 'utf8');

const targetStr = `  const level = teamAccessLevel();`;
const replacementStr = `  const r = String(state.user?.role || '').toLowerCase();
  const isFin = ['admin', 'caoh', 'oh', 'ceo', 'fin', 'fip'].includes(r);
  if (pageName === 'manager-finance' && isFin) return true;

  const level = teamAccessLevel();`;

if (code.includes(targetStr) && !code.includes(`pageName === 'manager-finance' && isFin`)) {
  code = code.replace(targetStr, replacementStr);
  fs.writeFileSync('src/utils/navPermissions.js', code, 'utf8');
  console.log('Fixed canAccessPage in navPermissions.js');
} else {
  console.log('Target string not found or already fixed in canAccessPage');
}
