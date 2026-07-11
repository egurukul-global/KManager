// ==================== ROLE-BASED NAV VISIBILITY (Phase 3) ====================
import { state } from '../state.js';

/** Pages an OTM (team member) may open. Team income/budgets/setup are hidden. */
const OTM_ALLOWED_PAGES = new Set([
  'dashboard',
  'transfer',
  'my-income',
  'add-expense',
  'expense-manager',
  'generate-receipt',
  'my-finances'
]);

/** Pages a view-only user may open. */
const VIEW_ALLOWED_PAGES = new Set([
  'dashboard',
  'view-budgets',
  'income-manager',
  'expense-manager',
  'expense-reports',
  'financial-status',
  'my-finances',
  'my-income',
  'buckets'
]);

/** Sub-items hidden for OTM inside sections that stay partially visible. */
const OTM_HIDDEN_PAGES = new Set([
  'buckets',
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
  'categories',
  'rates'
]);

function isOrgAdmin() {
  return ['admin', 'caoh', 'oh', 'ceo'].includes(state.user?.role);
}

export function isOtmOnly() {
  if (isOrgAdmin()) return false;
  return (state.userTeamAccess?.access_level || 'member') === 'member';
}

export function isOhtReadOnly() {
  if (isOrgAdmin()) return false;
  return state.userTeamAccess?.access_level === 'oht';
}

export function isViewOnly() {
  if (isOrgAdmin()) return false;
  return state.userTeamAccess?.access_level === 'view';
}

export function canAccessPage(pageName) {
  if (isOrgAdmin()) return true;

  const level = state.userTeamAccess?.access_level || 'member';

  if (level === 'view') {
    return VIEW_ALLOWED_PAGES.has(pageName);
  }

  if (level === 'oht') {
    return !OHT_HIDDEN_PAGES.has(pageName);
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

    el.style.display = hide ? 'none' : '';
  });

  const sectionPages = {
    setup: ['buckets', 'categories', 'rates'],
    budgets: ['create-budget', 'view-budgets'],
    income: ['add-funds', 'income-manager', 'transfer', 'my-income'],
    expense: ['add-expense', 'expense-manager', 'generate-receipt'],
    reports: ['expense-reports', 'my-finances', 'financial-status']
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

  updateBottomNavForRole();
}

function updateBottomNavForRole() {
  const budgetsTab = document.querySelector('.bottom-nav-item[data-tab="budgets"]');
  const expensesTab = document.querySelector('.bottom-nav-item[data-tab="expenses"]');
  const reportsTab = document.querySelector('.bottom-nav-item[data-tab="reports"]');

  if (isOtmOnly()) {
    if (budgetsTab) budgetsTab.style.display = 'none';
    if (reportsTab) reportsTab.style.display = 'none';
    if (expensesTab) expensesTab.style.display = '';
  } else if (isViewOnly()) {
    if (budgetsTab) budgetsTab.style.display = '';
    if (expensesTab) expensesTab.style.display = '';
    if (reportsTab) reportsTab.style.display = '';
  } else {
    [budgetsTab, expensesTab, reportsTab].forEach(el => {
      if (el) el.style.display = '';
    });
  }
}

/** Default page when a tab or role blocks the usual target. */
export function defaultPageForRole() {
  if (isOtmOnly()) return 'dashboard';
  if (isViewOnly()) return 'dashboard';
  return 'dashboard';
}

export function defaultPageForTab(tab) {
  if (tab === 'budgets' && isOtmOnly()) return 'my-finances';
  if (tab === 'reports' && isOtmOnly()) return 'my-finances';
  if (tab === 'expenses' && isViewOnly()) return 'expense-manager';
  const map = {
    dashboard: 'dashboard',
    budgets: 'view-budgets',
    expenses: 'expense-manager',
    reports: 'expense-reports'
  };
  return map[tab] || defaultPageForRole();
}
