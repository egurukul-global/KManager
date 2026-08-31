const fs = require('fs');
let code = fs.readFileSync('src/pages/buckets.js', 'utf8');
code = "import { escapeHtml } from '../utils/uiHelpers.js';\n" + code;
fs.writeFileSync('src/pages/buckets.js', code);
