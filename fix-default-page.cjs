const fs = require('fs');
let code = fs.readFileSync('src/utils/navPermissions.js', 'utf8');

const oldDefaultPage = `export function defaultPageForRole() {
  // Approvers (FIN/FIH/CAO via assignment or org role) land on their queue
  const org = String(state.user?.role || '').toLowerCase();
  if (['oh', 'caoh', 'ceo'].includes(org)) return 'approval-portal';
  if (isViewOnly()) return 'approval-portal';
  return 'dashboard';
}`;

const newDefaultPage = `export function defaultPageForRole() {
  const viewMode = state.activeViewContext || 'team';
  if (viewMode === 'admin') return 'role-assignments';
  if (viewMode === 'manager') return 'manager-finance';

  // Approvers (FIN/FIH/CAO via assignment or org role) land on their queue
  const org = String(state.user?.role || '').toLowerCase();
  if (['oh', 'caoh', 'ceo'].includes(org)) return 'approval-portal';
  if (isViewOnly()) return 'approval-portal';
  return 'dashboard';
}`;

if (code.includes(oldDefaultPage)) {
  code = code.replace(oldDefaultPage, newDefaultPage);
  fs.writeFileSync('src/utils/navPermissions.js', code, 'utf8');
  console.log('Fixed defaultPageForRole context awareness');
} else {
  console.log('Regex failed');
}
