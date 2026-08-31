const fs = require('fs');
let code = fs.readFileSync('src/utils/uiHelpers.js', 'utf8');

const exportsToAdd = `
export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function escapeHtmlAttr(str) {
  return escapeHtml(str);
}
`;

if (!code.includes('export function escapeHtml(')) {
  fs.writeFileSync('src/utils/uiHelpers.js', code + '\n' + exportsToAdd);
}
