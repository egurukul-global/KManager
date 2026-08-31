const fs = require('fs');
let code = fs.readFileSync('src/pages/manager-expenses.js', 'utf8');

// Add import
if (!code.includes("import { isFinanceGlobalAdmin } from '../utils/appRoles.js';")) {
  code = "import { isFinanceGlobalAdmin } from '../utils/appRoles.js';\n" + code;
}

// Replace isGlobal logic
const regex = /const globalRoles = \['admin', 'cao', 'caoh', 'ceo', 'oh', 'fih', 'fip', 'fin'\];\s*const isGlobal = globalRoles\.includes\(String\(state\.user\?\.role \|\| ''\)\.toLowerCase\(\)\);/;
const repl = `const isGlobal = isFinanceGlobalAdmin();`;

code = code.replace(regex, repl);
fs.writeFileSync('src/pages/manager-expenses.js', code);
