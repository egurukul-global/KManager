const fs = require('fs');
let code = fs.readFileSync('src/utils/teamAccess.js', 'utf8');

const oldFunc = `export function populateTeamSwitcher() {
  const select = document.getElementById('teamSelect');`;

const newFunc = `export function populateTeamSwitcher() {
  // Populate View Selector
  const viewSelect = document.getElementById('viewModeSelect');
  if (viewSelect && state.user && viewSelect.options.length <= 1) { // Only populate if empty (except the default "Team View")
    const role = String(state.user.role || '').toLowerCase();
    const isAdmin = ['admin', 'caoh', 'oh', 'ceo'].includes(role);
    const isManager = ['fin', 'fip'].includes(role) || state.userTeamAccess?.access_level === 'lead';
    
    let html = '<option value="team">Team View</option>';
    if (isAdmin || isManager) {
      html += '<option value="manager">Manager View</option>';
    }
    if (isAdmin) {
      html += '<option value="admin">Admin View</option>';
    }
    viewSelect.innerHTML = html;
    viewSelect.value = state.activeViewContext || state.user.default_login_view || 'team';
  }

  const select = document.getElementById('teamSelect');`;

code = code.replace(oldFunc, newFunc);
fs.writeFileSync('src/utils/teamAccess.js', code, 'utf8');
console.log('Fixed teamAccess.js view selector');
