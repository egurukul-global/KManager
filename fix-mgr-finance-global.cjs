const fs = require('fs');
let code = fs.readFileSync('src/pages/manager-finance.js', 'utf8');

if (!code.includes("import { isFinanceGlobalAdmin } from '../utils/appRoles.js';")) {
  code = "import { isFinanceGlobalAdmin } from '../utils/appRoles.js';\n" + code;
}

const regex = /const isGlobal = \['admin', 'cao', 'caoh', 'ceo', 'oh'\].includes\(String\(state\.user\?\.role \|\| ''\)\.toLowerCase\(\)\);/;
const repl = `const isGlobal = isFinanceGlobalAdmin();`;

code = code.replace(regex, repl);
fs.writeFileSync('src/pages/manager-finance.js', code);
