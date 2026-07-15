// ==================== MAIN ENTRY POINT =======================
import './styles.css';
import { state, computePermissions } from './state.js';
import { supabaseClient, syncAll, pushPendingChanges, initLocalDB } from './db.js';
import { showToast, showConfirm } from './components/toasts.js';
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
import { getReconcilePage, initReconcilePage } from './pages/reconcile.js';
import { getReconciliationOverviewPage, initReconciliationOverviewPage } from './pages/reconciliation-overview.js';
import { getReconciliationApprovalPage, initReconciliationApprovalPage } from './pages/reconciliation-approval.js';
import { getProfilePage, initProfilePage } from './pages/profile.js';
import { getApprovalPortalPage, initApprovalPortalPage } from './pages/approval-portal.js';
import { getRoleAssignmentsPage, initRoleAssignmentsPage } from './pages/role-assignments.js';
import { getExpenseReportsPage, initExpenseReportsPage } from './pages/expense-reports.js';
import { getAddExpensePage, initAddExpensePage, getExpenseManagerPage, initExpenseManagerPage } from './pages/expenses.js';
import { getGenerateReceiptPage, initGenerateReceiptPage } from './pages/generate-receipt.js';
import { loadUserTeamDefaultsForCurrentTeam } from './utils/userTeamDefaults.js';
import { getDisplayName } from './utils/displayName.js';
import { loadAccessibleTeams, syncCurrentTeamAfterReload, populateTeamSwitcher, updateAccessBadge } from './utils/teamAccess.js';
import { applyNavPermissions, canAccessPage, defaultPageForRole, defaultPageForTab } from './utils/navPermissions.js';
import { getTeamMgmtPage, initTeamMgmtPage } from './pages/team-mgmt.js';
import { getUserMgmtPage, initUserMgmtPage } from './pages/user-mgmt.js';
import { getMyFinancesPage, initMyFinancesPage } from './pages/my-finances.js';
import { getMyIncomePage, initMyIncomePage } from './pages/my-income.js';
import { getOkHomePage, initOkHomePage } from './pages/ok-home.js';
import { getOkAdminPage, initOkAdminPage } from './pages/ok-admin.js';
import { getOkProfilePage, initOkProfilePage } from './pages/ok-profile.js';
import { getComingSoonPage, initComingSoonPage } from './pages/ok-coming-soon.js';
import {
  loadOkAccess,
  parseAppPath,
  hasAppAccess,
  navigateOk
} from './utils/okAccess.js';
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
    if (window.location.pathname !== '/') {
      window.history.replaceState({}, '', '/');
    }
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

  const ok = await showConfirm('Sign out of One Kailasa?');
  if (!ok) return;

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
  state.isOkAdmin = false;
  state.okApps = [];
  state.okMenus = [];
  state.okPins = [];

  if (window.location.pathname !== '/') {
    window.history.replaceState({}, '', '/');
  }
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
      .select('id, email, name, role, team_id, gender, request_alias, request_counter, on_hold, notification_mode')
      .eq('id', state.session.user.id)
      .single();

    if (userError) {
      // Older schema without notification_mode
      const fallback = await supabaseClient
        .from('users')
        .select('id, email, name, role, team_id, gender, request_alias, request_counter, on_hold')
        .eq('id', state.session.user.id)
        .single();
      if (fallback.error) {
        state.user = {
          id: state.session.user.id,
          email: state.session.user.email,
          name: state.session.user.user_metadata?.name || state.session.user.email.split('@')[0],
          role: 'user',
          team_id: null,
          gender: null,
          on_hold: false,
          notification_mode: 'summary'
        };
      } else {
        state.user = { ...fallback.data, notification_mode: 'summary' };
      }
    } else {
      state.user = {
        ...userData,
        notification_mode: userData.notification_mode === 'detail' ? 'detail' : 'summary'
      };
    }

    if (state.user.on_hold) {
      await supabaseClient.auth.signOut();
      state.session = null;
      state.user = null;
      renderLoginScreen();
      const errorDiv = document.getElementById('loginError');
      if (errorDiv) {
        errorDiv.textContent = 'Your account is on hold. Contact an administrator.';
        errorDiv.classList.add('active');
      }
      return;
    }

    // 2. One Kailasa access (apps / menus / admin)
    await loadOkAccess(state.user.id);

    // 3. Teams (needed for Finance; optional for home)
    await loadAccessibleTeams(state.user.id);

    // 4. Auth + online listeners (once)
    if (!window.__okAuthBound) {
      window.__okAuthBound = true;
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
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      window.addEventListener('popstate', () => {
        if (state.session && state.user) routeAfterAuth();
      });
    }

    await routeAfterAuth();

  } catch (err) {
    console.error('Initialization error:', err);
    renderLoginScreen();
    setTimeout(() => {
      showToast(err.message || 'Failed to initialize app', 'error');
    }, 100);
    await supabaseClient.auth.signOut();
  }
}

async function routeAfterAuth() {
  const route = parseAppPath();

  if (route === 'home') {
    renderOkHome();
    return;
  }

  if (route === 'ok-admin') {
    renderOkAdmin();
    return;
  }

  if (route === 'ok-profile') {
    renderOkProfile();
    return;
  }

  if (route === 'gurukul' || route === 'utilities') {
    renderComingSoon(route);
    return;
  }

  // Finance
  if (!hasAppAccess('finance') && !state.isOkAdmin) {
    showToast('You do not have access to Finance.', 'warning');
    navigateOk('/');
    return;
  }

  if (state.teams.length === 0) {
    showToast('You are not assigned to any Finance teams yet.', 'warning');
    navigateOk('/');
    return;
  }

  const pendingTeamId = sessionStorage.getItem('ok_open_team_id');
  syncCurrentTeamAfterReload(pendingTeamId || undefined);
  await loadUserTeamDefaultsForCurrentTeam();
  await initLocalDB();

  if (navigator.onLine) {
    await syncAll(state.currentTeam.team_id);
    await pushPendingChanges();
  }

  renderAppShell();

  const showAdminNav = ['admin', 'caoh', 'oh', 'ceo'].includes(state.user?.role) || state.canManageTeamRoster;
  if (showAdminNav) {
    const adminNav = document.getElementById('adminNav');
    if (adminNav) adminNav.style.display = 'block';
  }

  populateTeamSwitcher();
  updateAccessBadge();
  applyNavPermissions();

  const pendingPage = sessionStorage.getItem('ok_open_page');
  if (pendingPage) {
    sessionStorage.removeItem('ok_open_page');
    showPage(canAccessPage(pendingPage) ? pendingPage : defaultPageForRole());
  } else {
    showPage(defaultPageForRole());
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
    online: 'On<br>line',
    offline: 'Off<br>line',
    syncing: 'Sync<br>ing',
    error: 'Error'
  };

  document.querySelectorAll('.sync-status').forEach(indicator => {
    if (indicator.classList.contains('bottom-nav-status') || indicator.id === 'syncIndicator') {
      indicator.className = `bottom-nav-item bottom-nav-status sync-status ${status}`;
    } else {
      indicator.className = `sync-status ${status}`;
    }
    const iconEl = indicator.querySelector('.sync-status-icon');
    const labelEl = indicator.querySelector('.sync-status-label');
    if (iconEl) iconEl.textContent = icons[status] || '⚪';
    if (labelEl) {
      if (indicator.id === 'syncIndicatorSidebar') {
        labelEl.innerHTML = labels[status] || status;
      } else {
        labelEl.textContent = (labels[status] || status).replace('<br>', ' ');
      }
    }
  });
}

// ==================== TEAM SWITCHER ====================


export async function switchTeam(teamId) {
  const team = state.teams.find(t => t.team_id === teamId);
  if (!team || team.team_id === state.currentTeam?.team_id) return;

  state.currentTeam = team;
  state.userTeamAccess = {
    access_level: String(team.access_level || 'member').toLowerCase().trim(),
    granted_by: team.granted_by,
    granted_at: team.granted_at
  };
  computePermissions();
  applyNavPermissions();

  await loadUserTeamDefaultsForCurrentTeam();

  updateAccessBadge();

  // Refresh current page
  const currentPage = document.querySelector('.nav-subitem.active')?.dataset.page || 'dashboard';
  const targetPage = canAccessPage(currentPage) ? currentPage : defaultPageForRole();
  showPage(targetPage);

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

function renderOkHome() {
  app.innerHTML = getOkHomePage();
  window.handleLogout = handleLogout;
  initOkHomePage();
}

function renderOkAdmin() {
  app.innerHTML = getOkAdminPage();
  window.handleLogout = handleLogout;
  initOkAdminPage();
}

function renderOkProfile() {
  app.innerHTML = getOkProfilePage();
  window.handleLogout = handleLogout;
  initOkProfilePage();
}

function renderComingSoon(appCode) {
  app.innerHTML = getComingSoonPage(appCode);
  window.handleLogout = handleLogout;
  initComingSoonPage();
}

function renderAppShell() {
  const displayName = getDisplayName(state.user);
  app.innerHTML = `
    <div class="mobile-header">
      <button class="menu-toggle" onclick="window.toggleSidebar()">☰</button>
      <h1>Finance</h1>
      <img src="${swamijiImg}" alt="" class="header-logo" width="36" height="36">
    </div>

    <div class="overlay" onclick="window.toggleSidebar()"></div>

    <div class="app-shell active">
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-user">
          <div class="sidebar-user-text">
            <span class="sidebar-app-title">Finance</span>
            <span id="userDisplayName" class="sidebar-display-name" title="${state.user?.name || ''}">${displayName}</span>
          </div>
          <span id="userAccessLevel" class="sidebar-access-badge"></span>
        </div>

        <div class="sidebar-top-row">
          <button type="button" class="sidebar-top-btn" onclick="window.goOkHome()">One<br>Kailasa</button>
          <button type="button" class="sidebar-top-btn" onclick="window.handleLogout()">Sign<br>Out</button>
          <div class="sidebar-top-btn sync-status online show-desktop" id="syncIndicatorSidebar" aria-live="polite">
            <span class="sync-status-icon" style="margin-right:2px;">🟢</span>
            <span class="sync-status-label">On<br>line</span>
          </div>
        </div>

        <div class="team-switcher" style="display:flex; align-items:center; gap:8px; padding:10px 16px; border-bottom:1px solid rgba(255,255,255,0.08); flex-shrink:0;">
          <label style="margin:0; white-space:nowrap; font-size:0.7em; text-transform:uppercase; letter-spacing:0.5px; opacity:0.7;">Team</label>
          <select id="teamSelect" onchange="window.switchTeam(this.value)" style="flex:1; padding:6px 8px; font-size:0.85em; height:32px; border:1px solid rgba(255,255,255,0.2); border-radius:6px; background:rgba(0,0,0,0.2); color:white; cursor:pointer;">
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
              <div class="nav-subitem" data-page="profile" onclick="window.showPage('profile')">My Profile</div>
              <div class="nav-subitem" data-page="approval-portal" onclick="window.showPage('approval-portal')">Approval Portal</div>
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
              <div class="nav-subitem" data-page="my-income" onclick="window.showPage('my-income')">My Income</div>
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

          <div class="nav-item" data-section="financials">
            <div class="nav-item-header" onclick="window.toggleNavItem(this)">
              <span class="icon">💹</span>
              <span>Financials</span>
              <span class="arrow">▶</span>
            </div>
            <div class="nav-subitems">
              <div class="nav-subitem" data-page="financial-status" onclick="window.showPage('financial-status')">Treasury</div>
              <div class="nav-subitem-label">Reconciliation</div>
              <div class="nav-subitem" data-page="reconcile" onclick="window.showPage('reconcile')">Reconcile</div>
              <div class="nav-subitem" data-page="reconciliation-overview" onclick="window.showPage('reconciliation-overview')">Overview</div>
              <div class="nav-subitem" data-page="reconciliation-approval" onclick="window.showPage('reconciliation-approval')">Approval</div>
            </div>
          </div>

          <div class="nav-item" data-section="reports">
            <div class="nav-item-header" onclick="window.toggleNavItem(this)">
              <span class="icon">📈</span>
              <span>Reports</span>
              <span class="arrow">▶</span>
            </div>
            <div class="nav-subitems">
              <div class="nav-subitem" data-page="expense-reports" onclick="window.showPage('expense-reports')">Expense Reports</div>
              <div class="nav-subitem" data-page="my-finances" onclick="window.showPage('my-finances')">My Finances</div>
            </div>
          </div>

          <div class="nav-item" data-section="admin" id="adminNav" style="display: none;">
            <div class="nav-item-header" onclick="window.toggleNavItem(this)">
              <span class="icon">⚙️</span>
              <span>Admin</span>
              <span class="arrow">▶</span>
            </div>
            <div class="nav-subitems">
              <div class="nav-subitem" data-page="team-mgmt" onclick="window.showPage('team-mgmt')">Teams</div>
              <div class="nav-subitem" data-page="role-assignments" onclick="window.showPage('role-assignments')">Role Assignments</div>
              <div class="nav-subitem" data-page="user-mgmt" onclick="window.showPage('user-mgmt')">Users</div>
              <div class="nav-subitem" data-page="budget-calendar" onclick="window.showPage('budget-calendar')">Budget Calendar</div>
              <div class="nav-subitem" data-page="category-master" onclick="window.showPage('category-master')">Category Master</div>
            </div>
          </div>
        </nav>


      </aside>

      <div class="main-area">
        <header class="app-topbar">
          <span class="app-topbar-title">Finance</span>
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
  window.goOkHome = () => navigateOk('/');
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
  'my-finances': 'reports',
  'my-income': 'reports',
  'financial-status': 'reports',
  'reconcile': 'reports',
  'reconciliation-overview': 'reports',
  'reconciliation-approval': 'reports',
  profile: 'dashboard',
  'approval-portal': 'dashboard',
  'role-assignments': 'dashboard'
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
  const page = defaultPageForTab(tab);
  if (page) showPage(page);
}

/** Map page id → top bar / mobile header title */
const PAGE_TITLES = {
  dashboard: 'Overview',
  profile: 'My Profile',
  'approval-portal': 'Approval Portal',
  buckets: 'Money Buckets',
  categories: 'Categories',
  rates: 'Exchange Rates',
  'create-budget': 'New Budget Plan',
  'view-budgets': 'View Budgets',
  'add-funds': 'Add Income',
  'income-manager': 'Income Manager',
  transfer: 'Transfer Funds',
  'my-income': 'My Income',
  'add-expense': 'Add Expense',
  'expense-manager': 'Expense Manager',
  'generate-receipt': 'Generate Receipt',
  'financial-status': 'Treasury',
  reconcile: 'Reconcile',
  'reconciliation-overview': 'Reconciliation Overview',
  'reconciliation-approval': 'Reconciliation Approval',
  'expense-reports': 'Expense Reports',
  'my-finances': 'My Finances',
  'team-mgmt': 'Teams',
  'role-assignments': 'Role Assignments',
  'user-mgmt': 'Users',
  'budget-calendar': 'Budget Calendar',
  'category-master': 'Category Master'
};

function updateShellPageTitle(pageName) {
  const title = PAGE_TITLES[pageName] || 'Finance';
  const top = document.querySelector('.app-topbar-title');
  if (top) top.textContent = title;
  const mobile = document.querySelector('.mobile-header h1');
  if (mobile) mobile.textContent = title;
}

export function showPage(pageName) {
  if (pageName === 'team-roster') pageName = 'team-mgmt';

  if (!canAccessPage(pageName)) {
    showToast('You do not have access to that page on this team.', 'warning');
    pageName = defaultPageForRole();
  }

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

  updateShellPageTitle(pageName);

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
    'my-finances': { html: getMyFinancesPage, init: initMyFinancesPage },
    'my-income': { html: getMyIncomePage, init: initMyIncomePage },
    'financial-status': { html: getFinancialStatusPage, init: initFinancialStatusPage },
    'reconcile': { html: getReconcilePage, init: initReconcilePage },
    'reconciliation-overview': { html: getReconciliationOverviewPage, init: initReconciliationOverviewPage },
    'reconciliation-approval': { html: getReconciliationApprovalPage, init: initReconciliationApprovalPage },
    profile: { html: getProfilePage, init: initProfilePage },
    'approval-portal': { html: getApprovalPortalPage, init: initApprovalPortalPage },
    'role-assignments': { html: getRoleAssignmentsPage, init: initRoleAssignmentsPage },
    'budget-calendar': { html: getBudgetCalendarPage, init: initBudgetCalendarPage },
    'category-master': { html: getCategoryMasterPage, init: initCategoryMasterPage },
    'user-mgmt': { html: getUserMgmtPage, init: initUserMgmtPage },
    'team-mgmt': { html: getTeamMgmtPage, init: initTeamMgmtPage }
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