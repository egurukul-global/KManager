// ==================== MAIN ENTRY POINT =======================
import './styles.css';
import { state, computePermissions } from './state.js';
import { supabaseClient, syncAll, pushPendingChanges, initLocalDB } from './db.js';
import { showToast } from './components/toasts.js';
import { getLoginPage, initLoginPage } from './pages/login.js';
import { getDashboardPage, initDashboardPage } from './pages/dashboard.js';
import { getBucketsPage, initBucketsPage } from './pages/buckets.js';
import { getCategoriesPage, initCategoriesPage } from './pages/categories.js';
import { getRatesPage, initRatesPage } from './pages/rates.js';
import { getCreateBudgetPage, initCreateBudgetPage, getViewBudgetsPage, initViewBudgetsPage } from './pages/budgets.js';
// ADDED: Income module imports
import { 
  getRecordIncomePage, 
  initRecordIncomePage, 
  getIncomeManagerPage, 
  initIncomeManagerPage, 
 } from './pages/income.js';

import {
  getTransferFundsPage,
  initTransferFundsPage
} from './pages/transfer.js';
import { getBudgetCalendarPage, initBudgetCalendarPage } from './pages/budget-calendar.js';
import { getCategoryMasterPage, initCategoryMasterPage } from './pages/category-master.js';
import { getFinancialStatusPage, initFinancialStatusPage } from './pages/financial-status.js';
import { getExpenseReportsPage, initExpenseReportsPage } from './pages/expense-reports.js';
import { getAddExpensePage, initAddExpensePage, getExpenseManagerPage, initExpenseManagerPage } from './pages/expenses.js';
import { getGenerateReceiptPage, initGenerateReceiptPage } from './pages/generate-receipt.js';
import { loadUserTeamDefaultsForCurrentTeam } from './utils/userTeamDefaults.js';
import { getDisplayName } from './utils/displayName.js';
import swamijiImg from './Swamiji.png';

// ==================== APP CONTAINER ====================
const app = document.getElementById('app');

// ==================== AUTH FUNCTIONS ====================

export async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  const errorDiv = document.getElementById('loginError');
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  btn.disabled = true;
  btn.innerHTML = '<span class="loading-spinner"></span>Signing in...';
  errorDiv.classList.remove('active');

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    state.session = data.session;
    await initializeApp();
  } catch (err) {
    console.error('Login error:', err);
    errorDiv.textContent = err.message || 'Invalid email or password. Please try again.';
    errorDiv.classList.add('active');
    btn.disabled = false;
    btn.innerHTML = 'Sign In';
  }
}

let isLoggingOut = false;

export async function handleLogout() {
  if (isLoggingOut) return; // Prevent double execution
  isLoggingOut = true;
  
  try {
    await supabaseClient.auth.signOut();
  } catch (err) {
    console.error('Logout error:', err);
  }
  
  state.user = null;
  state.teams = [];
  state.currentTeam = null;
  state.session = null;
  state.userTeamAcess = null;

  renderLoginScreen();
  
  // Reset flag after a delay
  setTimeout(() => { isLoggingOut = false; }, 500);
}

async function checkExistingSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    state.session = session;
    await initializeApp();
  } else {
    renderLoginScreen();
  }
}

// ===================== APP INITIALIZATION ====================

async function initializeApp() {
  try {
    // 1. Get user profile
    const { data: userData, error: userError } = await supabaseClient
      .from('users')
      .select('id, email, name, role, team_id, gender')
      .eq('id', state.session.user.id)
      .single();

    if (userError) {
      state.user = {
        id: state.session.user.id,
        email: state.session.user.email,
        name: state.session.user.user_metadata?.name || state.session.user.email.split('@')[0],
        role: 'user',
        team_id: null,
        gender: null
      };
    } else {
      state.user = userData;
    }

    // 2. Get all teams for this user
    const { data: teamsData, error: teamsError } = await supabaseClient
      .rpc('get_accessible_teams', { p_user_id: state.user.id });

    let rawTeams = [];

    if (teamsError) {
      console.warn('get_accessible_teams error:', teamsError);
      const { data: fallbackTeams } = await supabaseClient
        .from('user_teams')
        .select('team_id, is_primary, access_level, teams:team_id(id, name)')
        .eq('user_id', state.user.id);

      if (fallbackTeams) {
        rawTeams = fallbackTeams.map(t => ({
          team_id: t.team_id,
          team_name: t.teams?.name || 'Unknown',
          is_primary: t.is_primary,
          access_level: t.access_level || 'member'
        }));
      }
    } else {
      rawTeams = teamsData || [];
    }

    // Deduplicate teams by team_id
    const seenTeamIds = new Set();
    state.teams = [];
    for (const team of rawTeams) {
      if (team && team.team_id && !seenTeamIds.has(team.team_id)) {
        seenTeamIds.add(team.team_id);
        state.teams.push(team);
      }
    }

    if (state.teams.length === 0) {
      throw new Error('You are not assigned to any teams. Please contact an administrator.');
    }

    // 3. Set current team
    const primaryTeam = state.teams.find(t => t.is_primary);
    state.currentTeam = primaryTeam || state.teams[0];

    // 4. Set access level
    state.userTeamAccess = {
      access_level: state.currentTeam.access_level || 'member',
      granted_by: state.currentTeam.granted_by,
      granted_at: state.currentTeam.granted_at
    };

    // 5. Compute permissions
    computePermissions();

    await loadUserTeamDefaultsForCurrentTeam();

    // 6. Initialize local DB
    await initLocalDB();

    // 7. Sync data
    if (navigator.onLine) {
      await syncAll(state.currentTeam.team_id);
      await pushPendingChanges();
    }

    // 8. Render app shell
    renderAppShell();

    // 9. Show admin nav if applicable
    if (['admin', 'caoh', 'oh', 'ceo'].includes(state.user.role)) {
      const adminNav = document.getElementById('adminNav');
      if (adminNav) adminNav.style.display = 'block';
    }

    // 10. Populate team switcher
    populateTeamSwitcher();

    // 11. Load initial page
    showPage('dashboard');

    // 12. Setup auth state listener
    supabaseClient.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' && !isLoggingOut) {
        state.user = null;
        state.teams = [];
        state.currentTeam = null;
        state.session = null;
        state.userTeamAccess = null;
        renderLoginScreen();
      } else if (event === 'TOKEN_REFRESHED') {
        state.session = session;
      }
    });

    // 13. Setup online/offline listeners
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

  } catch (err) {
    console.error('Initialization error:', err);
    renderLoginScreen();
    setTimeout(() => {
      showToast(err.message || 'Failed to initialize app', 'error');
    }, 100);
    await supabaseClient.auth.signOut();
  }
}

// ==================== ONLINE/OFFLINE HANDLING ====================

function handleOnline() {
  state.isOnline = true;
  updateSyncStatus('online');
  showToast('Back online! Syncing data...', 'info');
  if (state.currentTeam) {
    syncAll(state.currentTeam.team_id);
    pushPendingChanges().then(result => {
      if (result.count > 0) {
        showToast(`Synced ${result.count} pending changes`, 'success');
      }
    });
  }
}

function handleOffline() {
  state.isOnline = false;
  updateSyncStatus('offline');
  showToast('You are offline. Changes will sync when connection returns.', 'warning');
}

function updateSyncStatus(status) {
  const icons = {
    online: '🟢',
    offline: '🟡',
    syncing: '🔵',
    error: '🔴'
  };
  const labels = {
    online: 'Online',
    offline: 'Offline',
    syncing: 'Syncing',
    error: 'Error'
  };

  document.querySelectorAll('.sync-status').forEach(indicator => {
    if (indicator.classList.contains('bottom-nav-status') || indicator.id === 'syncIndicator') {
      indicator.className = `bottom-nav-item bottom-nav-status sync-status ${status}`;
    } else if (indicator.classList.contains('sidebar-sync')) {
      indicator.className = `sidebar-sync sync-status show-desktop ${status}`;
    } else {
      indicator.className = `sync-status ${status}`;
    }
    const iconEl = indicator.querySelector('.sync-status-icon');
    const labelEl = indicator.querySelector('.sync-status-label');
    if (iconEl) iconEl.textContent = icons[status] || '⚪';
    if (labelEl) labelEl.textContent = labels[status] || status;
  });
}

// ==================== TEAM SWITCHER ====================

function populateTeamSwitcher() {
  const select = document.getElementById('teamSelect');
  if (!select) return;
  select.innerHTML = '';

  state.teams.forEach(team => {
    const option = document.createElement('option');
    option.value = team.team_id;
    option.textContent = team.team_name + (team.is_primary ? ' ★' : '');
    if (team.team_id === state.currentTeam.team_id) {
      option.selected = true;
    }
    select.appendChild(option);
  });
}

export async function switchTeam(teamId) {
  const team = state.teams.find(t => t.team_id === teamId);
  if (!team || team.team_id === state.currentTeam?.team_id) return;

  state.currentTeam = team;
  state.userTeamAccess = {
    access_level: team.access_level || 'member',
    granted_by: team.granted_by,
    granted_at: team.granted_at
  };
  computePermissions();

  await loadUserTeamDefaultsForCurrentTeam();

  // Update access badge
  const accessBadge = document.getElementById('userAccessLevel');
  if (accessBadge) {
    accessBadge.textContent = (state.userTeamAccess.access_level || 'member').toUpperCase();
  }

  // Refresh current page
  const currentPage = document.querySelector('.nav-subitem.active')?.dataset.page || 'dashboard';
  showPage(currentPage);

  // Sync new team data
  if (navigator.onLine) {
    await syncAll(teamId);
  }

  // Update primary team in DB
  try {
    await supabaseClient
      .from('user_teams')
      .update({ is_primary: false })
      .eq('user_id', state.user.id);

    await supabaseClient
      .from('user_teams')
      .update({ is_primary: true })
      .eq('user_id', state.user.id)
      .eq('team_id', teamId);
  } catch (e) {
    console.warn('Failed to update primary team:', e);
  }
}

// ==================== RENDERING ====================

function renderLoginScreen() {
  app.innerHTML = getLoginPage();
  initLoginPage();
  window.handleLogin = handleLogin;
}

function renderAppShell() {
  const displayName = getDisplayName(state.user);
  app.innerHTML = `
    <div class="mobile-header">
      <button class="menu-toggle" onclick="window.toggleSidebar()">☰</button>
      <h1>Kailasa Manager</h1>
      <img src="${swamijiImg}" alt="" class="header-logo" width="36" height="36">
    </div>

    <div class="overlay" onclick="window.toggleSidebar()"></div>

    <div class="app-shell active">
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-user">
          <span class="sidebar-trident" aria-hidden="true">🔱</span>
          <span id="userDisplayName" class="sidebar-display-name" title="${state.user?.name || ''}">${displayName}</span>
        </div>

        <div class="team-switcher">
          <label>Current Team</label>
          <select id="teamSelect" onchange="window.switchTeam(this.value)">
            <option value="">Loading teams...</option>
          </select>
        </div>

        <nav class="nav-menu">
          <div class="nav-item expanded" data-section="dashboard">
            <div class="nav-item-header" onclick="window.toggleNavItem(this)">
              <span class="icon">📊</span>
              <span>Dashboard</span>
              <span class="arrow">▶</span>
            </div>
            <div class="nav-subitems">
              <div class="nav-subitem active" data-page="dashboard" onclick="window.showPage('dashboard')">Overview</div>
            </div>
          </div>

          <div class="nav-item" data-section="setup">
            <div class="nav-item-header" onclick="window.toggleNavItem(this)">
              <span class="icon">🔧</span>
              <span>Setup</span>
              <span class="arrow">▶</span>
            </div>
            <div class="nav-subitems">
              <div class="nav-subitem" data-page="buckets" onclick="window.showPage('buckets')">Money Buckets</div>
              <div class="nav-subitem" data-page="categories" onclick="window.showPage('categories')">Categories</div>
              <div class="nav-subitem" data-page="rates" onclick="window.showPage('rates')">Exchange Rates</div>
            </div>
          </div>

          <div class="nav-item" data-section="budgets">
            <div class="nav-item-header" onclick="window.toggleNavItem(this)">
              <span class="icon">📋</span>
              <span>Budgets</span>
              <span class="arrow">▶</span>
            </div>
            <div class="nav-subitems">
              <div class="nav-subitem" data-page="create-budget" onclick="window.showPage('create-budget')">Create Budget</div>
              <div class="nav-subitem" data-page="view-budgets" onclick="window.showPage('view-budgets')">View Budgets</div>
            </div>
          </div>

          <div class="nav-item" data-section="income">
            <div class="nav-item-header" onclick="window.toggleNavItem(this)">
              <span class="icon">💰</span>
              <span>Income</span>
              <span class="arrow">▶</span>
            </div>
            <div class="nav-subitems">
              <div class="nav-subitem" data-page="add-funds" onclick="window.showPage('add-funds')">Add Income</div>
              <div class="nav-subitem" data-page="income-manager" onclick="window.showPage('income-manager')">Income Manager</div>
              <div class="nav-subitem" data-page="transfer" onclick="window.showPage('transfer')">Transfer Funds</div>
            </div>
          </div>

          <div class="nav-item" data-section="expense">
            <div class="nav-item-header" onclick="window.toggleNavItem(this)">
              <span class="icon">💸</span>
              <span>Expense</span>
              <span class="arrow">▶</span>
            </div>
            <div class="nav-subitems">
              <div class="nav-subitem" data-page="add-expense" onclick="window.showPage('add-expense')">Add Expense</div>
              <div class="nav-subitem" data-page="expense-manager" onclick="window.showPage('expense-manager')">Expense Manager</div>
              <div class="nav-subitem" data-page="generate-receipt" onclick="window.showPage('generate-receipt')">Generate Receipt</div>
            </div>
          </div>

          <div class="nav-item" data-section="reports">
            <div class="nav-item-header" onclick="window.toggleNavItem(this)">
              <span class="icon">📈</span>
              <span>Reports</span>
              <span class="arrow">▶</span>
            </div>
            <div class="nav-subitems">
              <div class="nav-subitem" data-page="expense-reports" onclick="window.showPage('expense-reports')">Reports</div>
              <div class="nav-subitem" data-page="financial-status" onclick="window.showPage('financial-status')">Financial Status</div>
            </div>
          </div>

          <div class="nav-item" data-section="admin" id="adminNav" style="display: none;">
            <div class="nav-item-header" onclick="window.toggleNavItem(this)">
              <span class="icon">⚙️</span>
              <span>Admin</span>
              <span class="arrow">▶</span>
            </div>
            <div class="nav-subitems">
              <div class="nav-subitem" data-page="user-mgmt" onclick="window.showPage('user-mgmt')">Users</div>
              <div class="nav-subitem" data-page="team-mgmt" onclick="window.showPage('team-mgmt')">Teams</div>
            </div>
          </div>
        </nav>

        <div class="sidebar-footer">
          <div class="sidebar-sync sync-status online show-desktop" id="syncIndicatorSidebar" aria-live="polite">
            <span class="sync-status-icon">🟢</span>
            <span class="sync-status-label">Online</span>
          </div>
          <button type="button" class="sidebar-signout" onclick="window.handleLogout()">Sign Out</button>
        </div>
      </aside>

      <div class="main-area">
        <header class="app-topbar">
          <span class="app-topbar-title">Kailasa Manager</span>
          <img src="${swamijiImg}" alt="" class="app-topbar-logo" width="40" height="40">
        </header>
        <main class="main-content" id="mainContent">
        </main>
      </div>
    </div>

    <div class="toast-container" id="toastContainer"></div>

    <nav class="bottom-nav" aria-label="Main navigation">
      <div class="bottom-nav-item bottom-nav-status sync-status online" id="syncIndicator" aria-live="polite">
        <span class="bottom-nav-icon sync-status-icon">🟢</span>
        <span class="bottom-nav-label sync-status-label">Online</span>
      </div>
      <button type="button" class="bottom-nav-item active" data-tab="dashboard" onclick="window.navToTab('dashboard')">
        <span class="bottom-nav-icon">📊</span>
        <span class="bottom-nav-label">Home</span>
      </button>
      <button type="button" class="bottom-nav-item" data-tab="budgets" onclick="window.navToTab('budgets')">
        <span class="bottom-nav-icon">📋</span>
        <span class="bottom-nav-label">Budgets</span>
      </button>
      <button type="button" class="bottom-nav-item" data-tab="expenses" onclick="window.navToTab('expenses')">
        <span class="bottom-nav-icon">💸</span>
        <span class="bottom-nav-label">Expenses</span>
      </button>
      <button type="button" class="bottom-nav-item" data-tab="reports" onclick="window.navToTab('reports')">
        <span class="bottom-nav-icon">📈</span>
        <span class="bottom-nav-label">Reports</span>
      </button>
      <button type="button" class="bottom-nav-item" data-tab="more" onclick="window.navToTab('more')">
        <span class="bottom-nav-icon">☰</span>
        <span class="bottom-nav-label">Menu</span>
      </button>
    </nav>
  `;

  // Expose functions to window for onclick handlers
  window.toggleSidebar = toggleSidebar;
  window.toggleNavItem = toggleNavItem;
  window.showPage = showPage;
  window.switchTeam = switchTeam;
  window.handleLogout = handleLogout;
  window.navToTab = navToTab;
}

// ==================== NAVIGATION ====================

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('active');
  document.querySelector('.overlay').classList.toggle('active');
}

function toggleNavItem(header) {
  const navItem = header.parentElement;
  navItem.classList.toggle('expanded');
}

/** Bottom nav tab → default page (mobile-first shortcuts) */
const TAB_DEFAULT_PAGES = {
  dashboard: 'dashboard',
  budgets: 'view-budgets',
  expenses: 'expense-manager',
  reports: 'expense-reports'
};

/** Map any page to its bottom-nav tab for active highlighting */
const PAGE_TO_TAB = {
  dashboard: 'dashboard',
  'view-budgets': 'budgets',
  'create-budget': 'budgets',
  'add-expense': 'expenses',
  'expense-manager': 'expenses',
  'generate-receipt': 'expenses',
  'expense-reports': 'reports',
  'financial-status': 'reports'
};

function updateBottomNavActive(pageName) {
  const tab = PAGE_TO_TAB[pageName] || null;
  document.querySelectorAll('.bottom-nav-item').forEach(btn => {
    btn.classList.toggle('active', tab && btn.dataset.tab === tab);
  });
}

export function navToTab(tab) {
  if (tab === 'more') {
    toggleSidebar();
    document.querySelectorAll('.bottom-nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === 'more');
    });
    return;
  }
  const page = TAB_DEFAULT_PAGES[tab];
  if (page) showPage(page);
}

export function showPage(pageName) {
  // Update active nav state
  document.querySelectorAll('.nav-subitem').forEach(item => {
    item.classList.remove('active');
    if (item.dataset.page === pageName) {
      item.classList.add('active');
    }
  });

  // Close mobile sidebar
  if (window.innerWidth <= 768) {
    toggleSidebar();
  }

  // Render page content
  const mainContent = document.getElementById('mainContent');
  const pages = {
    'dashboard': { html: getDashboardPage, init: initDashboardPage },
    'buckets': { html: getBucketsPage, init: initBucketsPage },
    'categories': { html: getCategoriesPage, init: initCategoriesPage },
    'rates': { html: getRatesPage, init: initRatesPage },
    'create-budget': { html: getCreateBudgetPage, init: initCreateBudgetPage },
    'view-budgets': { html: getViewBudgetsPage, init: initViewBudgetsPage },
   'add-funds': { html: getRecordIncomePage, init: initRecordIncomePage },
    'income-manager': { html: getIncomeManagerPage, init: initIncomeManagerPage },
    'transfer': { html: getTransferFundsPage, init: initTransferFundsPage },
    'add-expense': { html: getAddExpensePage, init: initAddExpensePage },
    'expense-manager': { html: getExpenseManagerPage, init: initExpenseManagerPage },
    'generate-receipt': { html: getGenerateReceiptPage, init: initGenerateReceiptPage },
    'expense-reports': { html: getExpenseReportsPage, init: initExpenseReportsPage },
    'financial-status': { html: getFinancialStatusPage, init: initFinancialStatusPage },
    'budget-calendar': { html: getBudgetCalendarPage, init: initBudgetCalendarPage },
    'category-master': { html: getCategoryMasterPage, init: initCategoryMasterPage },
    'user-mgmt': { html: () => placeholderPage('User Management', 'Session 8'), init: () => {} },
    'team-mgmt': { html: () => placeholderPage('Team Managemet', 'Session 8'), init: () => {} }
  };

  updateBottomNavActive(pageName);

  const page = pages[pageName];
  if (page) {
    mainContent.innerHTML = page.html();
    setTimeout(() => page.init(), 0);
  } else {
    mainContent.innerHTML = '<div class="card"><h2>Page not found</h2></div>';
  }
}

function placeholderPage(title, session) {
  return `
    <h1 class="page-title">${title}</h1>
    <div class="card">
      <h2>⏳ Coming Soon</h2>
      <p style="color: #666;">This feature will be implemented in ${session}.</p>
      <p style="margin-top: 15px; color: #999; font-size: 0.9em;">
        Current focus: Session 3 — Migration + Categories + Rates
      </p>
    </div>
  `;
}

// ===================== BOOT ====================
document.addEventListener('DOMContentLoaded', () => {
  checkExistingSession();
});