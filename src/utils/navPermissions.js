// ==================== ROLE-BASED NAV VISIBILITY (Phase 3 + 4A + 4D menu access) ====================
import { state } from '../state.js';
import { hasMenuAccess } from './okAccess.js';

/** Only system admin bypasses team-level role restrictions. */
export function isSystemAdmin() {
  return state.user?.role === 'admin';
}

function isOrgAdmin() {
  return ['admin', 'caoh', 'oh', 'ceo'].includes(state.user?.role);
}

const ORG_ADMIN_ONLY_PAGES = new Set([
  'user-mgmt',
  'budget-calendar',
  'category-master',
  'role-assignments'
]);

const FINANCE_PAGES = new Set([
  'buckets', 'categories', 'rates', 'create-budget', 'view-budgets',
  'add-funds', 'income-manager', 'transfer', 'my-income',
  'add-expense', 'expense-manager', 'generate-receipt',
  'financial-status', 'reconcile', 'reconciliation-overview', 'reconciliation-approval',
  'expense-reports', 'my-finances', 'category-master', 'budget-calendar'
]);

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
  'reconcile',
  'reconciliation-overview',
  'reconciliation-approval'
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
  'reconcile',
  'reconciliation-overview',
  'reconciliation-approval',
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
  if (state.currentTeam?.from_role_assignment) return 'view';
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

function canAccessTeamsPage() {
  if (isSystemAdmin()) return true;
  return isOrgAdmin() || !!state.canManageTeamRoster;
}

export function canAccessPage(pageName) {
  if (pageName === 'team-roster') pageName = 'team-mgmt';

  if (isSystemAdmin()) return true;

  // Check selected team capabilities
  if (FINANCE_PAGES.has(pageName) && state.currentTeam?.has_budget_access === false) return false;
  if (pageName === 'tasks' && state.currentTeam?.has_tasks_access === false) return false;
  if (['gurukul-lms', 'learners', 'courses'].includes(pageName) && state.currentTeam?.has_lms_access === false) return false;

  // One Kailasa Finance menu matrix
  if (state.okMenus?.length && !hasMenuAccess('finance', pageName)) {
    return false;
  }

  if (pageName === 'team-mgmt') {
    return canAccessTeamsPage();
  }

  if (pageName === 'role-assignments') {
    const role = String(state.user?.role || 'user').toLowerCase();
    return ['admin', 'oh', 'caoh'].includes(role);
  }

  if (ORG_ADMIN_ONLY_PAGES.has(pageName)) {
    return isOrgAdmin();
  }

  const level = teamAccessLevel();

  if (level === 'view') {
    return VIEW_ALLOWED_PAGES.has(pageName);
  }

  if (level === 'oht') {
    if (OHT_HIDDEN_PAGES.has(pageName)) return false;
    return true;
  }

  if (level === 'member') {
    return OTM_ALLOWED_PAGES.has(pageName);
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
    if (page === 'team-mgmt' && !canAccessTeamsPage()) hide = true;
    if (ORG_ADMIN_ONLY_PAGES.has(page) && !isOrgAdmin() && !isSystemAdmin()) hide = true;
    if (page === 'role-assignments') {
      const role = String(state.user?.role || 'user').toLowerCase();
      if (!['admin', 'oh', 'caoh'].includes(role)) hide = true;
    }
    if (state.okMenus?.length && !hasMenuAccess('finance', page)) hide = true;

    // Check selected team capabilities
    if (FINANCE_PAGES.has(page) && state.currentTeam?.has_budget_access === false) hide = true;
    if (page === 'tasks' && state.currentTeam?.has_tasks_access === false) hide = true;
    if (['gurukul-lms', 'learners', 'courses'].includes(page) && state.currentTeam?.has_lms_access === false) hide = true;

    el.style.display = hide ? 'none' : '';
  });

  const sectionPages = {
    setup: ['buckets', 'categories', 'rates'],
    budgets: ['create-budget', 'view-budgets'],
    income: ['add-funds', 'income-manager', 'transfer', 'my-income'],
    expense: ['add-expense', 'expense-manager', 'generate-receipt'],
    financials: ['financial-status', 'reconcile', 'reconciliation-overview', 'reconciliation-approval'],
    reports: ['expense-reports', 'my-finances'],
    admin: ['team-mgmt', 'role-assignments', 'user-mgmt', 'budget-calendar', 'category-master'],
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

  const adminNav = document.getElementById('adminNav');
  if (adminNav) {
    const showAdmin = isSystemAdmin() || isOrgAdmin() || state.canManageTeamRoster;
    adminNav.style.display = showAdmin ? '' : 'none';
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
  // Approvers (FIN/FIH/CAO via assignment or org role) land on their queue
  const org = String(state.user?.role || '').toLowerCase();
  if (['oh', 'caoh', 'ceo'].includes(org)) return 'approval-portal';
  if (isViewOnly()) return 'approval-portal';
  return 'dashboard';
}

export function defaultPageForTab(tab) {
  if (tab === 'budgets' && isOtmOnly()) return 'my-finances';
  if (tab === 'reports' && isOtmOnly()) return 'reconcile';
  if (tab === 'expenses' && (isViewOnly() || isOhtReadOnly())) return 'expense-manager';
  const map = {
    dashboard: 'dashboard',
    budgets: 'view-budgets',
    expenses: 'expense-manager',
    reports: 'expense-reports'
  };
  return map[tab] || defaultPageForRole();
}
