const fs = require('fs');

// 1. Fix teamAccess.js
let teamCode = fs.readFileSync('src/utils/teamAccess.js', 'utf8');
const oldTeamPop = `  if (viewSelect && state.user && viewSelect.options.length <= 1) { // Only populate if empty (except the default "Team View")`;
const newTeamPop = `  if (viewSelect && state.user) {`;

if (teamCode.includes(oldTeamPop)) {
  teamCode = teamCode.replace(oldTeamPop, newTeamPop);
}
const oldTeamSet = `    viewSelect.value = state.activeViewContext || state.user.default_login_view || 'team';
  }`;
const newTeamSet = `    if (!state.activeViewContext) {
      state.activeViewContext = state.user.default_login_view || 'team';
    }
    viewSelect.value = state.activeViewContext;
  }`;
if (teamCode.includes(oldTeamSet)) {
  teamCode = teamCode.replace(oldTeamSet, newTeamSet);
}
fs.writeFileSync('src/utils/teamAccess.js', teamCode, 'utf8');

// 2. Fix navPermissions.js
let navCode = fs.readFileSync('src/utils/navPermissions.js', 'utf8');

if (!navCode.includes(`import { state } from '../state.js';`)) {
  navCode = `import { state } from '../state.js';\n` + navCode;
}

const oldCanAccess = /export function canAccessPage\(pageName\) \{[\s\S]*?const level = teamAccessLevel\(\);[\s\S]*?return true;\s*\}/m;
const newCanAccess = `export function canAccessPage(pageName) {
  if (pageName === 'design-preview') return true;
  if (pageName === 'team-roster') pageName = 'team-mgmt';
  if (isSystemAdmin()) return true;

  const viewMode = state.activeViewContext || 'team';
  const allowedPages = VIEW_MENUS[viewMode]?.pages || [];
  
  if (!allowedPages.includes(pageName) && !['tasks', 'courses', 'konnect'].includes(pageName)) {
    return false;
  }

  // Still run the fundamental core Finance restriction 
  if (state.okMenus?.length && !NON_FINANCE_PAGES.has(pageName) && !hasMenuAccess('finance', pageName)) {
    return false;
  }

  return true;
}`;

if (oldCanAccess.test(navCode)) {
  navCode = navCode.replace(oldCanAccess, newCanAccess);
}

fs.writeFileSync('src/utils/navPermissions.js', navCode, 'utf8');

console.log('Fixed QA issues');
