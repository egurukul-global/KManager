const fs = require('fs');

let mainCode = fs.readFileSync('src/main.js', 'utf8');

const regexHeader = /<div class="sidebar-top-row">[\s\S]*?<div class="team-switcher"/m;
const newHeader = `<div class="sidebar-top-row" style="padding: 10px 16px; display: flex; gap: 8px; border-bottom: 1px solid rgba(255,255,255,0.08); justify-content: space-between;">
          <button type="button" class="sq-btn" style="background:#ea580c; color:white; border:none; border-radius:4px; width:36px; height:36px; font-weight:bold; cursor:pointer;" onclick="window.goOkHome()" title="One Kailasa">1K</button>
          <button type="button" class="sq-btn" style="background:#16a34a; color:white; border:none; border-radius:4px; width:36px; height:36px; font-weight:bold; cursor:pointer;" id="syncIndicatorSidebar" title="Online">✔</button>
          <button type="button" class="sq-btn" style="background:#dc2626; color:white; border:none; border-radius:4px; width:36px; height:36px; font-weight:bold; cursor:pointer;" onclick="window.handleLogout()" title="Sign Out">✖</button>
        </div>
        
        <div class="view-selector" style="display:flex; align-items:center; gap:8px; padding:10px 16px; border-bottom:1px solid rgba(255,255,255,0.08); flex-shrink:0;">
          <label style="margin:0; white-space:nowrap; font-size:0.7em; text-transform:uppercase; letter-spacing:0.5px; opacity:0.7;">View</label>
          <select id="viewModeSelect" onchange="window.switchViewMode(this.value)" style="flex:1; padding:6px 8px; font-size:0.85em; height:32px; border:1px solid rgba(255,255,255,0.2); border-radius:6px; background:rgba(0,0,0,0.2); color:white; cursor:pointer;">
            <option value="team">Team View</option>
          </select>
        </div>

        <div class="team-switcher"`;

if (regexHeader.test(mainCode)) {
  mainCode = mainCode.replace(regexHeader, newHeader);
  console.log('Replaced header via regex');
} else {
  console.log('Regex header failed');
}

const regexPop = /const teamSelect = document\.getElementById\('teamSelect'\);\s*if\s*\(teamSelect\)\s*\{\s*teamSelect\.innerHTML = state\.teams\.map/m;
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
    teamSelect.innerHTML = state.teams.map`;

if (regexPop.test(mainCode)) {
  mainCode = mainCode.replace(regexPop, newPop);
  console.log('Replaced populate via regex');
}

fs.writeFileSync('src/main.js', mainCode, 'utf8');

let navCode = fs.readFileSync('src/utils/navPermissions.js', 'utf8');
const navRegex = /export function applyNavPermissions\(\) \{\s*const otm = isOtmOnly\(\);\s*const oht = isOhtReadOnly\(\);\s*const viewOnly = isViewOnly\(\);/m;

const newNav = `const VIEW_MENUS = {
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
  
  document.querySelectorAll('.nav-item').forEach(el => {
    const section = el.dataset.section;
    if (section && !allowedViewSections.has(section)) el.style.display = 'none';
    else el.style.display = '';
  });
  
  const ts = document.querySelector('.team-switcher');
  if (ts) ts.style.display = viewMode === 'team' ? 'flex' : 'none';
  
  const otm = isOtmOnly();
  const oht = isOhtReadOnly();
  const viewOnly = isViewOnly();`;

if (navRegex.test(navCode)) {
  navCode = navCode.replace(navRegex, newNav);
  console.log('Replaced nav logic via regex');
}

fs.writeFileSync('src/utils/navPermissions.js', navCode, 'utf8');
