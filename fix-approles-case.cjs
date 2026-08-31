const fs = require('fs');
let code = fs.readFileSync('src/utils/appRoles.js', 'utf8');

const regex1 = /if \(appCode === 'finance' && state\.user\?\.role === roleCode\) return true;/g;
const repl1 = `if (appCode === 'finance' && String(state.user?.role || '').toLowerCase().trim() === roleCode) return true;`;

const regex2 = /if \(\['fih', 'fin', 'fip', 'cao', 'oh', 'caoh'\]\.includes\(state\.user\?\.role\)\) return true;/g;
const repl2 = `if (['fih', 'fin', 'fip', 'cao', 'oh', 'caoh'].includes(String(state.user?.role || '').toLowerCase().trim())) return true;`;

const regex3 = /if \(state\.user\?\.role === 'admin' \|\| state\.user\?\.role === 'ceo'\) return true;/g;
const repl3 = `const r = String(state.user?.role || '').toLowerCase().trim();
  if (r === 'admin' || r === 'ceo') return true;`;

code = code.replace(regex1, repl1);
code = code.replace(regex2, repl2);
code = code.replace(regex3, repl3);

fs.writeFileSync('src/utils/appRoles.js', code);
