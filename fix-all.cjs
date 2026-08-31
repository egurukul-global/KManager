const fs = require('fs');

// ====== FIX MAIN.JS (Phase 2) ======
let mainCode = fs.readFileSync('src/main.js', 'utf8');

const oldHeaderStr = `<div class="sidebar-top-row">
          <button type="button" class="sidebar-top-btn" onclick="window.goOkHome()">One<br>Kailasa</button>
          <button type="button" class="sidebar-top-btn" onclick="window.handleLogout()">Sign<br>Out</button>
          <div class="sidebar-top-btn sync-status online show-desktop" id="syncIndicatorSidebar" aria-live="polite">
            <span class="sync-status-icon" style="margin-right:2px;">🟢</span>
            <span class="sync-status-label">On<br>line</span>
          </div>
        </div>`;

const newHeaderStr = `<div class="sidebar-top-row" style="padding: 10px 16px; display: flex; gap: 8px; border-bottom: 1px solid rgba(255,255,255,0.08); justify-content: space-between;">
          <button type="button" class="sq-btn" style="background:#ea580c; color:white; border:none; border-radius:4px; width:36px; height:36px; font-weight:bold; cursor:pointer;" onclick="window.goOkHome()" title="One Kailasa">1K</button>
          <button type="button" class="sq-btn" style="background:#16a34a; color:white; border:none; border-radius:4px; width:36px; height:36px; font-weight:bold; cursor:pointer;" id="syncIndicatorSidebar" title="Online">✔</button>
          <button type="button" class="sq-btn" style="background:#dc2626; color:white; border:none; border-radius:4px; width:36px; height:36px; font-weight:bold; cursor:pointer;" onclick="window.handleLogout()" title="Sign Out">✖</button>
        </div>
        
        <div class="view-selector" style="display:flex; align-items:center; gap:8px; padding:10px 16px; border-bottom:1px solid rgba(255,255,255,0.08); flex-shrink:0;">
          <label style="margin:0; white-space:nowrap; font-size:0.7em; text-transform:uppercase; letter-spacing:0.5px; opacity:0.7;">View</label>
          <select id="viewModeSelect" onchange="window.switchViewMode(this.value)" style="flex:1; padding:6px 8px; font-size:0.85em; height:32px; border:1px solid rgba(255,255,255,0.2); border-radius:6px; background:rgba(0,0,0,0.2); color:white; cursor:pointer;">
            <option value="team">Team View</option>
          </select>
        </div>`;

if (mainCode.includes(oldHeaderStr)) {
  mainCode = mainCode.replace(oldHeaderStr, newHeaderStr);
  console.log('Replaced header in main.js');
} else {
  console.log('Could not find old header in main.js!');
}

const oldPopulateStr = `const teamSelect = document.getElementById('teamSelect');
  if (teamSelect) {
    teamSelect.innerHTML = state.teams.map(t =>`;

const newPopulateStr = `// Populate View Selector
  const viewSelect = document.getElementById('viewModeSelect');
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
    teamSelect.innerHTML = state.teams.map(t =>`;

if (mainCode.includes(oldPopulateStr)) {
  mainCode = mainCode.replace(oldPopulateStr, newPopulateStr);
  console.log('Replaced dropdown population in main.js');
} else {
  console.log('Could not find dropdown population in main.js!');
}

if (!mainCode.includes('window.switchViewMode =')) {
  mainCode = mainCode.replace(
    'window.switchTeam = switchTeam;',
    `window.switchTeam = switchTeam;\nwindow.switchViewMode = function(viewMode) { state.activeViewContext = viewMode; localStorage.setItem('kmanager_view_mode', viewMode); import('./utils/navPermissions.js').then(m => m.applyNavPermissions()); window.showPage(viewMode === 'admin' ? 'role-assignments' : viewMode === 'manager' ? 'manager-finance' : 'dashboard'); };`
  );
}

fs.writeFileSync('src/main.js', mainCode, 'utf8');

// ====== FIX NAVPERMISSIONS.JS (Phase 3) ======
let navCode = fs.readFileSync('src/utils/navPermissions.js', 'utf8');

const oldNavLogic = `export function applyNavPermissions() {
  const otm = isOtmOnly();
  const oht = isOhtReadOnly();
  const viewOnly = isViewOnly();`;

const newNavLogic = `
const VIEW_MENUS = {
  team: {
    sections: ['dashboard', 'setup', 'budgets', 'income', 'expense', 'financials', 'reports'],
    pages: ['dashboard', 'profile', 'approval-portal', 'buckets', 'rates', 'view-budgets', 'create-budget', 'add-funds', 'transfer', 'income-manager', 'my-income', 'add-expense', 'expense-manager', 'generate-receipt', 'financial-status', 'reconcile', 'reconciliation-overview', 'reconciliation-approval', 'expense-reports', 'my-finances']
  },
  manager: {
    sections: ['setup', 'financials', 'reports'],
    pages: ['buckets', 'manager-finance', 'aggregate-reports']
  },
  admin: {
    sections: ['admin', 'setup'],
    pages: ['team-mgmt', 'role-assignments', 'user-mgmt', 'budget-calendar', 'category-master', 'categories']
  }
};

export function applyNavPermissions() {
  const viewMode = state.activeViewContext || 'team';
  const allowedViewPages = new Set(VIEW_MENUS[viewMode]?.pages || []);
  const allowedViewSections = new Set(VIEW_MENUS[viewMode]?.sections || []);
  
  // 1. Hide/Show top-level sections
  document.querySelectorAll('.nav-item').forEach(el => {
    const section = el.dataset.section;
    if (section && !allowedViewSections.has(section)) {
      el.style.display = 'none';
    } else {
      el.style.display = '';
    }
  });
  
  // 2. Hide/Show Team Switcher
  const ts = document.querySelector('.team-switcher');
  if (ts) {
    ts.style.display = viewMode === 'team' ? 'flex' : 'none';
  }
  
  const otm = isOtmOnly();
  const oht = isOhtReadOnly();
  const viewOnly = isViewOnly();`;

if (navCode.includes(oldNavLogic)) {
  navCode = navCode.replace(oldNavLogic, newNavLogic);
  console.log('Replaced nav logic in navPermissions.js');
} else {
  console.log('Could not find nav logic in navPermissions.js!');
}

const oldPageLoop = `  document.querySelectorAll('.nav-subitem[data-page]').forEach(el => {
    const page = el.dataset.page;
    let hide = false;`;

const newPageLoop = `  document.querySelectorAll('.nav-subitem[data-page]').forEach(el => {
    const page = el.dataset.page;
    let hide = false;
    
    if (!allowedViewPages.has(page)) hide = true;`;

if (navCode.includes(oldPageLoop)) {
  navCode = navCode.replace(oldPageLoop, newPageLoop);
  console.log('Replaced page loop in navPermissions.js');
}

fs.writeFileSync('src/utils/navPermissions.js', navCode, 'utf8');

console.log('Done.');
