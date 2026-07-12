// ==================== ROLE-BASED NAV VISIBILITY (Phase 3 + 4A) ====================
import { state } from '../state.js';

/** Only system admin bypasses team-level role restrictions. */
export function isSystemAdmin() {
  return state.user?.role === 'admin';
}

/** Pages an OTM (team member / OPS) may open. Team income/budgets/setup are hidden. */
const OTM_ALLOWED_PAGES = new Set([
  'dashboard',
  'profile',
  'approval-portal',
  'buckets',
  'transfer',
  'my-income',
  'add-expense',
  'expense-manager',
  'generate-receipt',
  'my-finances',
  'reconciliation-overview'
]);

/** Pages a view-only user may open (read-only team finance). */
const VIEW_ALLOWED_PAGES = new Set([
  'dashboard',
  'profile',
  'approval-portal',
  'view-budgets',
  'income-manager',
  'expense-manager',
  'expense-reports',
  'financial-status',
  'reconciliation-overview',
  'my-finances',
  'my-income',
  'buckets',
  'rates'
]);

/** Sub-items hidden for OTM inside sections that stay partially visible. */
const OTM_HIDDEN_PAGES = new Set([
  'categories',
  'rates',
  'create-budget',
  'view-budgets',
  'add-funds',
  'income-manager',
  'expense-reports',
  'financial-status'
]);

/** Write actions OHT cannot use (read-only team ops). */
const OHT_HIDDEN_PAGES = new Set([
  'create-budget',
  'add-funds',
  'transfer',
  'add-expense',
  'generate-receipt',
  'categories'
]);

export function teamAccessLevel() {
  return String(state.userTeamAccess?.access_level || 'member').toLowerCase().trim();
}

export function isOtmOnly() {
  if (isSystemAdmin()) return false;
  return teamAccessLevel() === 'member';
}

export function isOhtReadOnly() {
  if (isSystemAdmin()) return false;
  return teamAccessLevel() === 'oht';
}

export function isViewOnly() {
  if (isSystemAdmin()) return false;
  return teamAccessLevel() === 'view';
}

export function canAccessPage(pageName) {
  if (isSystemAdmin()) return true;

  if (pageName === 'role-assignments') {
    const role = String(state.user?.role || 'user').toLowerCase();
    return ['admin', 'oh', 'caoh'].includes(role);
  }

  const level = teamAccessLevel();

  if (level === 'view') {
    return VIEW_ALLOWED_PAGES.has(pageName);
  }

  if (level === 'oht') {
    if (OHT_HIDDEN_PAGES.has(pageName)) return false;
    if (pageName === 'team-roster') return !!state.canManageTeamRoster;
    return true;
  }

  if (level === 'member') {
    return OTM_ALLOWED_PAGES.has(pageName);
  }

  if (pageName === 'team-roster') {
    return !!state.canManageTeamRoster;
  }

  return true;
}

/** Hide nav sections / items based on current team role. */
export function applyNavPermissions() {
  const otm = isOtmOnly();
  const oht = isOhtReadOnly();
  const viewOnly = isViewOnly();

  document.querySelectorAll('.nav-subitem[data-page]').forEach(el => {
    const page = el.dataset.page;
    let hide = false;

    if (otm && OTM_HIDDEN_PAGES.has(page)) hide = true;
    if (otm && !OTM_ALLOWED_PAGES.has(page)) hide = true;
    if (viewOnly && !VIEW_ALLOWED_PAGES.has(page)) hide = true;
    if (oht && OHT_HIDDEN_PAGES.has(page)) hide = true;
    if (page === 'team-roster' && !state.canManageTeamRoster) hide = true;
    if (page === 'role-assignments') {
      const role = String(state.user?.role || 'user').toLowerCase();
      if (!['admin', 'oh', 'caoh'].includes(role)) hide = true;
    }

    el.style.display = hide ? 'none' : '';
  });

  const sectionPages = {
    setup: ['buckets', 'categories', 'rates'],
    budgets: ['create-budget', 'view-budgets'],
    income: ['add-funds', 'income-manager', 'transfer', 'my-income'],
    expense: ['add-expense', 'expense-manager', 'generate-receipt'],
    financials: ['financial-status', 'reconciliation-overview'],
    reports: ['expense-reports', 'my-finances'],
    teamadmin: ['team-roster'],
    dashboard: ['dashboard', 'profile', 'approval-portal']
  };

  Object.entries(sectionPages).forEach(([section, pages]) => {
    const navItem = document.querySelector(`.nav-item[data-section="${section}"]`);
    if (!navItem) return;
    const anyVisible = pages.some(p => {
      const el = navItem.querySelector(`.nav-subitem[data-page="${p}"]`);
      return el && el.style.display !== 'none';
    });
    navItem.style.display = anyVisible ? '' : 'none';
  });

  const teamAdminNav = document.getElementById('teamAdminNav');
  if (teamAdminNav && state.canManageTeamRoster) {
    const rosterEl = teamAdminNav.querySelector('[data-page="team-roster"]');
    if (rosterEl && rosterEl.style.display !== 'none') {
      teamAdminNav.style.display = '';
    }
  }

  updateBottomNavForRole();
}

function updateBottomNavForRole() {
  const budgetsTab = document.querySelector('.bottom-nav-item[data-tab="budgets"]');
  const expensesTab = document.querySelector('.bottom-nav-item[data-tab="expenses"]');
  const reportsTab = document.querySelector('.bottom-nav-item[data-tab="reports"]');

  if (isOtmOnly()) {
    if (budgetsTab) budgetsTab.style.display = 'none';
    if (reportsTab) reportsTab.style.display = '';
    if (expensesTab) expensesTab.style.display = '';
  } else if (isViewOnly() || isOhtReadOnly()) {
    if (budgetsTab) budgetsTab.style.display = '';
    if (expensesTab) expensesTab.style.display = '';
    if (reportsTab) reportsTab.style.display = '';
  } else {
    [budgetsTab, expensesTab, reportsTab].forEach(el => {
      if (el) el.style.display = '';
    });
  }
}

export function defaultPageForRole() {
  return 'dashboard';
}

export function defaultPageForTab(tab) {
  if (tab === 'budgets' && isOtmOnly()) return 'my-finances';
  if (tab === 'reports' && isOtmOnly()) return 'reconciliation-overview';
  if (tab === 'expenses' && (isViewOnly() || isOhtReadOnly())) return 'expense-manager';
  const map = {
    dashboard: 'dashboard',
    budgets: 'view-budgets',
    expenses: 'expense-manager',
    reports: 'expense-reports'
  };
  return map[tab] || defaultPageForRole();
}
