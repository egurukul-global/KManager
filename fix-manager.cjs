const fs = require('fs');
let code = fs.readFileSync('src/pages/manager-finance.js', 'utf8');

const badCheck = `  const allowedRoles = ['cao', 'ceo', 'fih', 'fin', 'fip'];
  if (!state.userRoles || !state.userRoles.some(r => allowedRoles.includes(r.role.toLowerCase()))) {`;

const goodCheck = `  const allowedRoles = ['admin', 'cao', 'caoh', 'ceo', 'oh', 'fin', 'fip'];
  const userRole = String(state.user?.role || '').toLowerCase();
  if (!allowedRoles.includes(userRole)) {`;

code = code.replace(badCheck, goodCheck);

// Let's also check loadFinanceDashboardData for similar errors
const badGlobalCheck = `const isGlobal = state.userRoles.some(r => ['cao', 'ceo', 'fih'].includes(r.role.toLowerCase()));`;
const goodGlobalCheck = `const isGlobal = ['admin', 'cao', 'caoh', 'ceo', 'oh'].includes(String(state.user?.role || '').toLowerCase());`;

if (code.includes(badGlobalCheck)) {
  code = code.replace(badGlobalCheck, goodGlobalCheck);
}

fs.writeFileSync('src/pages/manager-finance.js', code, 'utf8');
console.log('Fixed manager-finance access logic');
