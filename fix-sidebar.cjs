const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');

const oldHeader = `<div class="sidebar-top-row">
          <button type="button" class="sidebar-top-btn" onclick="window.goOkHome()">One<br>Kailasa</button>
          <button type="button" class="sidebar-top-btn" onclick="window.handleLogout()">Sign<br>Out</button>
          <div class="sidebar-top-btn sync-status online show-desktop" id="syncIndicatorSidebar" aria-live="polite">
            <span class="sync-status-icon" style="margin-right:2px;">🟢</span>
            <span class="sync-status-label">On<br>line</span>
          </div>
        </div>

        <div class="team-switcher" style="display:flex; align-items:center; gap:8px; padding:10px 16px; border-bottom:1px solid rgba(255,255,255,0.08); flex-shrink:0;">`;

const newHeader = `<div class="sidebar-top-row" style="padding: 10px 16px; display: flex; gap: 8px; border-bottom: 1px solid rgba(255,255,255,0.08); justify-content: space-between;">
          <button type="button" class="sq-btn" style="background:#ea580c; color:white; border:none; border-radius:4px; width:36px; height:36px; font-weight:bold; cursor:pointer;" onclick="window.goOkHome()" title="One Kailasa">1K</button>
          <button type="button" class="sq-btn" style="background:#16a34a; color:white; border:none; border-radius:4px; width:36px; height:36px; font-weight:bold; cursor:pointer;" id="syncIndicatorSidebar" title="Online">✔</button>
          <button type="button" class="sq-btn" style="background:#dc2626; color:white; border:none; border-radius:4px; width:36px; height:36px; font-weight:bold; cursor:pointer;" onclick="window.handleLogout()" title="Sign Out">✖</button>
        </div>
        
        <div class="view-selector" style="display:flex; align-items:center; gap:8px; padding:10px 16px; border-bottom:1px solid rgba(255,255,255,0.08); flex-shrink:0;">
          <label style="margin:0; white-space:nowrap; font-size:0.7em; text-transform:uppercase; letter-spacing:0.5px; opacity:0.7;">View</label>
          <select id="viewModeSelect" onchange="window.switchViewMode(this.value)" style="flex:1; padding:6px 8px; font-size:0.85em; height:32px; border:1px solid rgba(255,255,255,0.2); border-radius:6px; background:rgba(0,0,0,0.2); color:white; cursor:pointer;">
            <option value="team">Team View</option>
            <!-- Populated dynamically via renderAppShell -->
          </select>
        </div>

        <div class="team-switcher" id="teamSwitcherContainer" style="display:flex; align-items:center; gap:8px; padding:10px 16px; border-bottom:1px solid rgba(255,255,255,0.08); flex-shrink:0;">`;

code = code.replace(oldHeader, newHeader);

// We need to inject logic into renderAppShell to populate viewModeSelect based on role
const oldPopulate = `const teamSelect = document.getElementById('teamSelect');
  if (teamSelect) {
    teamSelect.innerHTML = state.teams.map(t =>`;

const newPopulate = `// Populate View Selector
  const viewSelect = document.getElementById('viewModeSelect');
  if (viewSelect && state.user) {
    const role = String(state.user.role || '').toLowerCase();
    const isAdmin = ['admin', 'caoh', 'oh', 'ceo'].includes(role);
    const isManager = ['fin', 'fip'].includes(role);
    
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
    teamSelect.innerHTML = state.teams.map(t =>`;

code = code.replace(oldPopulate, newPopulate);

// Add switchViewMode function globally
const oldGlobal = `window.switchTeam = switchTeam;`;
const newGlobal = `window.switchTeam = switchTeam;
window.switchViewMode = function(viewMode) {
  state.activeViewContext = viewMode;
  localStorage.setItem('kmanager_view_mode', viewMode);
  import('./utils/navPermissions.js').then(m => m.applyNavPermissions());
  window.showPage(viewMode === 'admin' ? 'role-assignments' : viewMode === 'manager' ? 'manager-finance' : 'dashboard');
};`;

code = code.replace(oldGlobal, newGlobal);

fs.writeFileSync('src/main.js', code, 'utf8');
console.log('Phase 2 sidebar updates injected');
