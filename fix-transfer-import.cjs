const fs = require('fs');
let code = fs.readFileSync('src/pages/transfer.js', 'utf8');

code = code.replace(/import \{ isFinanceGlobalAdmin \} from '\.\.\/utils\/appRoles\.js';\n/g, '');
code = "import { isFinanceGlobalAdmin } from '../utils/appRoles.js';\n" + code;

fs.writeFileSync('src/pages/transfer.js', code);
