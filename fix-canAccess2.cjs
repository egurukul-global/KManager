const fs = require('fs');
let code = fs.readFileSync('src/utils/navPermissions.js', 'utf8');

const oldLogic = `export function canAccessPage(pageName) {
  if (pageName === 'design-preview') return true;
  if (pageName === 'team-roster') pageName = 'team-mgmt';

  if (isSystemAdmin()) return true;



  // One Kailasa Finance menu matrix
  if (state.okMenus?.length && !NON_FINANCE_PAGES.has(pageName) && !hasMenuAccess('finance', pageName)) {
    return false;
  }`;

const newLogic = `export function canAccessPage(pageName) {
  if (pageName === 'design-preview') return true;
  if (pageName === 'team-roster') pageName = 'team-mgmt';

  if (isSystemAdmin()) return true;

  // View Architecture strict page routing restriction
  const viewMode = state.activeViewContext || 'team';
  const allowedPages = VIEW_MENUS[viewMode]?.pages || [];
  if (!allowedPages.includes(pageName) && !['tasks', 'courses', 'konnect'].includes(pageName)) {
    return false;
  }

  // One Kailasa Finance menu matrix
  if (state.okMenus?.length && !NON_FINANCE_PAGES.has(pageName) && !hasMenuAccess('finance', pageName)) {
    return false;
  }`;

code = code.replace(oldLogic, newLogic);
fs.writeFileSync('src/utils/navPermissions.js', code, 'utf8');
console.log('Fixed canAccessPage in navPermissions');
