const fs = require('fs');
let code = fs.readFileSync('src/pages/buckets.js', 'utf8');

const importStatement = "import { formatMoney } from '../utils/financialStatusHelpers.js';\n";

if (!code.includes('formatMoney } from')) {
  code = code.replace("import { state } from '../state.js';", "import { state } from '../state.js';\n" + importStatement);
  fs.writeFileSync('src/pages/buckets.js', code);
}
