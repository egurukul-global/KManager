const fs = require('fs');
let code = fs.readFileSync('src/pages/manager-expenses.js', 'utf8');

// Fix imports again
const oldImports = `import { showToast, escapeHtml, escapeHtmlAttr } from '../utils/uiHelpers.js';`;
const newImports = `import { escapeHtml, escapeHtmlAttr } from '../utils/uiHelpers.js';
import { showToast } from '../components/toasts.js';`;

code = code.replace(oldImports, newImports);

fs.writeFileSync('src/pages/manager-expenses.js', code);
