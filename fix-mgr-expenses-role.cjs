const fs = require('fs');
let code = fs.readFileSync('src/pages/manager-expenses.js', 'utf8');

const regex = /const isGlobal = isFinanceGlobalAdmin\(\);/;
const repl = `const isGlobal = hasAnyGlobalFinanceRole();`;

code = code.replace(regex, repl);
code = code.replace(/import \{ isFinanceGlobalAdmin \} from '\.\.\/utils\/appRoles\.js';/, `import { hasAnyGlobalFinanceRole } from '../utils/appRoles.js';`);

fs.writeFileSync('src/pages/manager-expenses.js', code);
