const fs = require('fs');
let code = fs.readFileSync('src/pages/manager-expenses.js', 'utf8');

// Fix imports
const oldImports = `import { showToast, escapeHtml, escapeHtmlAttr, formatUsdDisplay } from '../utils/uiHelpers.js';`;
const newImports = `import { showToast, escapeHtml, escapeHtmlAttr } from '../utils/uiHelpers.js';
import { formatUsdDisplay } from '../utils/currency.js';`;

code = code.replace(oldImports, newImports);
fs.writeFileSync('src/pages/manager-expenses.js', code);
