const fs = require('fs');
let code = fs.readFileSync('src/utils/navPermissions.js', 'utf8');

const oldLines = `export function defaultPageForRole() {
  // Approvers (FIN/FIH/CAO via assignment or org role) land on their queue
  const org = String(state.user?.role || '').toLowerCase();
  if (['oh', 'caoh', 'ceo'].includes(org)) return 'approval-portal';
  if (isViewOnly()) return 'approval-portal';
  return 'dashboard';
}`;

const newLines = `export function defaultPageForRole() {
  const viewMode = state.activeViewContext || 'team';
  if (viewMode === 'admin') return 'role-assignments';
  if (viewMode === 'manager') return 'manager-finance';

  // Approvers (FIN/FIH/CAO via assignment or org role) land on their queue
  const org = String(state.user?.role || '').toLowerCase();
  if (['oh', 'caoh', 'ceo'].includes(org)) return 'approval-portal';
  if (isViewOnly()) return 'approval-portal';
  return 'dashboard';
}`;

if (code.includes(oldLines.replace(/\r\n/g, '\n'))) {
  code = code.replace(oldLines.replace(/\r\n/g, '\n'), newLines);
  fs.writeFileSync('src/utils/navPermissions.js', code, 'utf8');
  console.log('Fixed using \\n');
} else if (code.includes(oldLines.replace(/\n/g, '\r\n'))) {
  code = code.replace(oldLines.replace(/\n/g, '\r\n'), newLines);
  fs.writeFileSync('src/utils/navPermissions.js', code, 'utf8');
  console.log('Fixed using \\r\\n');
} else {
  // Let's just use string operations based on exact matching of smaller chunks
  code = code.replace(
    'export function defaultPageForRole() {',
    "export function defaultPageForRole() {\n  const viewMode = state.activeViewContext || 'team';\n  if (viewMode === 'admin') return 'role-assignments';\n  if (viewMode === 'manager') return 'manager-finance';\n"
  );
  fs.writeFileSync('src/utils/navPermissions.js', code, 'utf8');
  console.log('Fixed by injecting at the top of the function');
}
