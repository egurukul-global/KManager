const fs = require('fs');
let code = fs.readFileSync('src/pages/buckets.js', 'utf8');

const localDef = `
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
`;

code = code.replace("import { btnIconEdit, btnIconDelete, cardRow, escapeHtml } from '../utils/uiHelpers.js';", "import { btnIconEdit, btnIconDelete, cardRow } from '../utils/uiHelpers.js';\n" + localDef);
fs.writeFileSync('src/pages/buckets.js', code);
