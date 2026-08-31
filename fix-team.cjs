const fs = require('fs');
let code = fs.readFileSync('src/utils/teamAccess.js', 'utf8');

const regexPopulate = /const viewSelect = document\.getElementById\('viewModeSelect'\);[\s\S]*?viewSelect\.value = state\.activeViewContext;\n  \}/m;

const newPopulate = `const viewSelect = document.getElementById('viewModeSelect');
  const viewContainer = document.getElementById('viewSelectorContainer');
  
  if (viewSelect && state.user) {
    const role = String(state.user.role || '').toLowerCase();
    const isAdmin = ['admin', 'caoh', 'oh', 'ceo'].includes(role);
    const isManager = ['fin', 'fip'].includes(role) || state.userTeamAccess?.access_level === 'lead';
    
    // Only show if user has options other than just Team
    if (isAdmin || isManager) {
      if (viewContainer) viewContainer.style.display = 'flex';
      
      let html = '<option value="team">Team</option>';
      if (isAdmin || isManager) html += '<option value="manager">Manager</option>';
      if (isAdmin) html += '<option value="admin">Admin</option>';
      
      viewSelect.innerHTML = html;
      
      if (!state.activeViewContext) {
        state.activeViewContext = state.user.default_login_view || 'team';
      }
      viewSelect.value = state.activeViewContext;
    } else {
      if (viewContainer) viewContainer.style.display = 'none';
      if (!state.activeViewContext) {
        state.activeViewContext = 'team';
      }
    }
  }`;

if (regexPopulate.test(code)) {
  code = code.replace(regexPopulate, newPopulate);
  fs.writeFileSync('src/utils/teamAccess.js', code, 'utf8');
  console.log('Fixed teamAccess.js dropdown');
} else {
  console.log('Failed to match teamAccess.js dropdown logic');
}
