const fs = require('fs');
let code = fs.readFileSync('src/state.js', 'utf8');

// Insert import if not exists
if (!code.includes('hasAnyGlobalFinanceRole')) {
  code = "import { hasAnyGlobalFinanceRole } from './utils/appRoles.js';\n" + code;
}

const regex = /  if \(role === 'admin'\) \{/;
const repl = `  if (hasAnyGlobalFinanceRole()) {
    state.canTransferFunds = true;
    state.canManageIncome = true;
  }
  if (role === 'admin') {`;

code = code.replace(regex, repl);
fs.writeFileSync('src/state.js', code);
