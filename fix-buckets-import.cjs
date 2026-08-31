const fs = require('fs');
let code = fs.readFileSync('src/pages/buckets.js', 'utf8');
code = code.replace("import { escapeHtml } from '../utils/uiHelpers.js';\n", "");
code = code.replace("import { btnIconEdit, btnIconDelete, cardRow } from '../utils/uiHelpers.js';", "import { btnIconEdit, btnIconDelete, cardRow, escapeHtml } from '../utils/uiHelpers.js';");
fs.writeFileSync('src/pages/buckets.js', code);
