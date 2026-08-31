const fs = require('fs');

let mainCode = fs.readFileSync('src/main.js', 'utf8');

const regexPop = /const teamSelect = document\.getElementById\('teamSelect'\);\s*if\s*\(teamSelect\)\s*\{\s*teamSelect\.innerHTML = state\.teams/m;
const newPop = `const viewSelect = document.getElementById('viewModeSelect');
  if (viewSelect && state.user) {
    const role = String(state.user.role || '').toLowerCase();
    const isAdmin = ['admin', 'caoh', 'oh', 'ceo'].includes(role);
    const isManager = ['fin', 'fip'].includes(role) || state.userTeamAccess?.access_level === 'lead';
    
    viewSelect.innerHTML = '<option value="team">Team View</option>';
    if (isAdmin || isManager) {
      viewSelect.innerHTML += '<option value="manager">Manager View</option>';
    }
    if (isAdmin) {
      viewSelect.innerHTML += '<option value="admin">Admin View</option>';
    }
    viewSelect.value = state.activeViewContext || state.user.default_login_view || 'team';
  }

  const teamSelect = document.getElementById('teamSelect');
  if (teamSelect) {
    teamSelect.innerHTML = state.teams`;

if (regexPop.test(mainCode)) {
  mainCode = mainCode.replace(regexPop, newPop);
  console.log('Replaced populate via regex');
} else {
  console.log('Failed to find teamSelect population');
}

if (!mainCode.includes('window.switchViewMode =')) {
  mainCode = mainCode.replace(
    'window.switchTeam = switchTeam;',
    `window.switchTeam = switchTeam;\nwindow.switchViewMode = function(viewMode) { state.activeViewContext = viewMode; localStorage.setItem('kmanager_view_mode', viewMode); import('./utils/navPermissions.js').then(m => m.applyNavPermissions()); window.showPage(viewMode === 'admin' ? 'role-assignments' : viewMode === 'manager' ? 'manager-finance' : 'dashboard'); };`
  );
}

fs.writeFileSync('src/main.js', mainCode, 'utf8');
