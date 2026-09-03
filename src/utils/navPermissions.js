// ==================== ROLE-BASED NAV VISIBILITY (Phase 3 + 4A + 4D menu access) ====================
import { state } from '../state.js';
import { hasMenuAccess } from './okAccess.js';
import { isFinanceGlobalAdmin } from './appRoles.js';

/** Only system admin bypasses team-level role restrictions. */
export function isSystemAdmin() {
  return state.user?.role === 'admin';
}

function isOrgAdmin() {
  const role = String(state.user?.role || '').toLowerCase();
  return ['admin', 'caoh', 'oh', 'ceo', 'fih'].includes(role) || isFinanceGlobalAdmin();
}

const ORG_ADMIN_ONLY_PAGES = new Set([
  'user-mgmt',
  'role-assignments'
]);

const FINANCE_SETUP_PAGES = new Set([
  'budget-calendar',
  'categories',
  'budget-types',
  'budget-templates',
  'category-master'
]);

const FINANCE_PAGES = new Set([
  'buckets', 'categories', 'rates', 'create-budget', 'view-budgets',
  'add-funds', 'income-manager', 'transfer', 'my-income',
  'add-expense', 'expense-manager', 'generate-receipt',
  'financial-status', 'reconcile-label', 'reconcile', 'reconciliation-overview', 'reconciliation-approval',
  'expense-reports', 'my-finances', 'manager-finance', 'manager-expenses', 'category-master', 'budget-calendar',
  'budget-types', 'budget-templates'
]);

const NON_FINANCE_PAGES = new Set([
  'reconcile-label','tasks', 'gurukul-lms', 'courses', 'learners']);

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
  'reconciliation-approval',
  'tasks',
  'gurukul-lms',
  'courses',
  'learners'
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
  'rates',
  'tasks',
  'gurukul-lms',
  'courses',
  'learners'
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
  'buckets',
  'create-budget',
  'add-funds',
  'transfer',
  'view-transfers',
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
  if (pageName === 'design-preview') return true;
  if (pageName === 'team-roster') pageName = 'team-mgmt';
  if (isSystemAdmin()) return true;

  const viewMode = state.activeViewContext || 'team';
  const allowedPages = new Set(VIEW_MENUS[viewMode]?.pages || []);
  const showAdmin = isSystemAdmin() || isOrgAdmin() || state.canManageTeamRoster;
  if (showAdmin) {
    VIEW_MENUS.admin.pages.forEach(p => allowedPages.add(p));
  }
  
  if (!allowedPages.has(pageName) && !['tasks', 'courses', 'konnect'].includes(pageName)) {
    return false;
  }

  // Still run the fundamental core Finance restriction 
  if (state.okMenus?.length && !NON_FINANCE_PAGES.has(pageName) && !hasMenuAccess('finance', pageName)) {
    return false;
  }

  return true;
}

/** Hide nav sections / items based on current team role. */
const VIEW_MENUS = {
  team: {
    sections: ['dashboard', 'setup', 'finance-setup', 'budgets', 'income', 'expense', 'financials', 'reports'],
    pages: ['dashboard', 'profile', 'approval-portal', 'rates', 'buckets', 'view-budgets', 'create-budget', 'add-funds', 'transfer', 'view-transfers', 'income-manager', 'my-income', 'add-expense', 'expense-manager', 'generate-receipt', 'financial-status', 'reconcile', 'reconciliation-overview', 'reconciliation-approval', 'expense-reports', 'my-finances', 'categories', 'budget-types', 'budget-templates', 'budget-calendar']
  },
  manager: {
    sections: ['dashboard', 'income', 'financials', 'reports'],
    pages: ['profile', 'approval-portal', 'transfer', 'view-transfers', 'manager-finance', 'manager-expenses', 'aggregate-reports']
  },
  admin: {
    sections: ['admin', 'setup', 'finance-setup'],
    pages: ['team-mgmt', 'role-assignments', 'user-mgmt', 'budget-calendar', 'category-master', 'categories', 'buckets', 'budget-types', 'budget-templates']
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
  
  // Hide the Team dropdown when not in Team view, but DO NOT hide the View dropdown!
  const teamDropdown = document.getElementById('teamSelect');
  if (teamDropdown) {
    const tsContainer = teamDropdown.closest('.team-switcher');
    if (tsContainer) {
      tsContainer.style.display = viewMode === 'team' ? 'flex' : 'none';
    }
  }
  
  const otm = isOtmOnly();
  const oht = isOhtReadOnly();
  const viewOnly = isViewOnly();

  document.querySelectorAll('.nav-subitem[data-page], .nav-subitem-label[data-page]').forEach(el => {
    const page = el.dataset.page;
    let hide = false;
      const isAdminPage = VIEW_MENUS.admin.pages.includes(page);
    
    if (!allowedViewPages.has(page)) hide = true;

    if (!isAdminPage && otm && OTM_HIDDEN_PAGES.has(page)) hide = true;
    if (!isAdminPage && otm && !OTM_ALLOWED_PAGES.has(page)) {
      const r = String(state.user?.role || '').toLowerCase();
      const isFin = ['admin', 'caoh', 'oh', 'ceo', 'fin', 'fip', 'fih'].includes(r);
      if ((page === 'manager-finance' || page === 'transfer' || page === 'view-transfers' || page === 'manager-expenses') && isFin) { /* let it show */ } else { hide = true; }
    }
    if (!isAdminPage && viewOnly && !VIEW_ALLOWED_PAGES.has(page)) {
      const r = String(state.user?.role || '').toLowerCase();
      const isFin = ['admin', 'caoh', 'oh', 'ceo', 'fin', 'fip', 'fih'].includes(r);
      if ((page === 'manager-finance' || page === 'transfer' || page === 'view-transfers' || page === 'manager-expenses') && isFin) { /* let it show */ } else { hide = true; }
    }
    if (!isAdminPage && oht && OHT_HIDDEN_PAGES.has(page)) hide = true;
    if (page === 'team-mgmt' && !canAccessTeamsPage()) hide = true;
    if (ORG_ADMIN_ONLY_PAGES.has(page) && !isOrgAdmin() && !isSystemAdmin()) hide = true;
    // Money Buckets: org admins always; team leads/admins at team level
    if (page === 'buckets' && !isOrgAdmin() && !isSystemAdmin()) {
      const level = String(state.userTeamAccess?.access_level || '').toLowerCase().trim();
      if (level !== 'lead' && level !== 'admin') hide = true;
    }
    if (FINANCE_SETUP_PAGES.has(page)) {
      const hasFinanceSetupRole = state.appRoleAssignments?.some(ar => ar.app_code === 'finance_setup');
      // Allow: org admins, system admins, or users with finance_setup app role
      if (!isOrgAdmin() && !isSystemAdmin() && !hasFinanceSetupRole) hide = true;
    }
    if (page === 'role-assignments') {
      const role = String(state.user?.role || 'user').toLowerCase();
      if (!['admin', 'oh', 'caoh', 'fih'].includes(role) && !isFinanceGlobalAdmin()) hide = true;
    }
    if (state.okMenus?.length && !NON_FINANCE_PAGES.has(page) && !hasMenuAccess('finance', page)) hide = true;

    // Check selected team capabilities
    if (FINANCE_PAGES.has(page) && state.currentTeam?.has_budget_access === false && page !== 'manager-finance' && page !== 'manager-expenses') hide = true;
    if (page === 'tasks' && state.currentTeam?.has_tasks_access === false) hide = true;
    if (['gurukul-lms', 'learners', 'courses'].includes(page) && state.currentTeam?.has_lms_access === false) hide = true;

    el.style.display = hide ? 'none' : '';
  });

  const sectionPages = {
    setup: ['rates'],
    'finance-setup': ['categories', 'budget-types', 'budget-templates', 'budget-calendar'],
    budgets: ['create-budget', 'view-budgets'],
    income: ['add-funds', 'income-manager', 'transfer', 'view-transfers', 'my-income'],
    expense: ['add-expense', 'expense-manager', 'generate-receipt'],
    financials: ['financial-status', 'manager-finance', 'manager-expenses', 'reconcile', 'reconciliation-overview', 'reconciliation-approval'],
    reports: ['expense-reports', 'my-finances'],
    tasks: ['tasks'],
    gurukul: ['gurukul-lms', 'courses'],
    admin: ['team-mgmt', 'role-assignments', 'user-mgmt', 'buckets'],
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
    adminNav.style.display = (showAdmin && allowedViewSections.has('admin')) ? '' : 'none';
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
  const viewMode = state.activeViewContext || 'team';
  if (viewMode === 'admin') return 'role-assignments';
  if (viewMode === 'manager') return 'manager-finance';

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
