const fs = require('fs');

// Fix teamAccess.js
let teamCode = fs.readFileSync('src/utils/teamAccess.js', 'utf8');

const populateTeamSwitcherRegex = /export function populateTeamSwitcher\(\) \{[\s\S]*?const select = document\.getElementById\('teamSelect'\);[\s\S]*?if \(!select \|\| !state\.currentTeam\) return;[\s\S]*?select\.innerHTML = '';[\s\S]*?state\.teams\.forEach\(team => \{[\s\S]*?\}\);[\s\S]*?\}/m;

const newPopulateTeamSwitcher = `export function populateTeamSwitcher() {
  const viewSelect = document.getElementById('viewModeSelect');
  if (viewSelect && state.user) {
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
    if (!state.activeViewContext) {
      state.activeViewContext = state.user.default_login_view || 'team';
    }
    viewSelect.value = state.activeViewContext;
  }

  const select = document.getElementById('teamSelect');
  if (!select || !state.currentTeam) return;
  select.innerHTML = '';

  state.teams.forEach(team => {
    const option = document.createElement('option');
    option.value = team.team_id;
    const rawName = team.team_name || '';
    const displayName = rawName.length > 15 ? rawName.slice(0, 15) + '...' : rawName;
    option.textContent = displayName + (team.is_primary ? ' ★' : '');
    if (team.team_id === state.currentTeam.team_id) {
      option.selected = true;
    }
    select.appendChild(option);
  });
}`;

if (populateTeamSwitcherRegex.test(teamCode)) {
  teamCode = teamCode.replace(populateTeamSwitcherRegex, newPopulateTeamSwitcher);
  fs.writeFileSync('src/utils/teamAccess.js', teamCode, 'utf8');
  console.log('Fixed teamAccess.js');
} else {
  console.log('Failed to match populateTeamSwitcher');
}

// Fix navPermissions.js
let navCode = fs.readFileSync('src/utils/navPermissions.js', 'utf8');

const navSubitemRegex = /document\.querySelectorAll\('\.nav-subitem\[data-page\]'\)\.forEach\(el => \{[\s\S]*?const page = el\.dataset\.page;[\s\S]*?let hide = false;/m;
const newNavSubitem = `document.querySelectorAll('.nav-subitem[data-page]').forEach(el => {
    const page = el.dataset.page;
    let hide = false;
    
    if (!allowedViewPages.has(page)) hide = true;`;

if (navSubitemRegex.test(navCode)) {
  navCode = navCode.replace(navSubitemRegex, newNavSubitem);
  fs.writeFileSync('src/utils/navPermissions.js', navCode, 'utf8');
  console.log('Fixed navPermissions.js allowedViewPages check');
} else {
  console.log('Failed to match nav-subitem logic');
}
