import { hasAnyGlobalFinanceRole, isFinanceGlobalAdmin } from './utils/appRoles.js';
// ==================== GLOBAL STATE ====================
export const state = {
  user: null,
  teams: [],
  currentTeam: null,
  activeViewContext: sessionStorage.getItem('kmanager_view_mode') || null,
  session: null,
  userTeamAccess: null,
  canCreateBuckets: false,
  canEditBuckets: false,
  canDeleteBuckets: false,
  canCreateCategories: false,
  canEditCategories: false,
  canDeleteCategories: false,
  canCreateBudgets: false,
  canEditBudgets: false,
  canDeleteBudgets: false,
  // 💵 Income Module State Tracking
  incomeRecords: [],
  canManageIncome: false,
  canTransferFunds: false,
  canManageExpenses: false,
  canViewAllExpenses: false,
  canViewTeamIncome: false,
  canViewTeamBudgets: false,
  canManageTeamRoster: false,
  canCreateOhtTeam: false,
  isReadOnlyTeamAccess: false,
  canSubmitReconciliation: false,
  showDeleted: false,
  pendingDeleteId: null,
  isOnline: navigator.onLine,
  syncInProgress: false,
  lastSync: null,
  teamDefaults: null,
  teamDefaultsTeamId: null,
  // Org-global finance config (loaded from DB, fallback to built-ins)
  budgetTypes: null,
  // One Kailasa shell (4D)
  isOkAdmin: false,
  okApps: [],
  okMenus: [],
  okPins: []
};

// ==================== PERMISSIONS ====================
export function computePermissions() {
  const role = state.user?.role || 'user';
  let level = String(state.userTeamAccess?.access_level || 'member').toLowerCase().trim();
  if (state.currentTeam?.from_role_assignment) {
    level = 'view';
  }
  state.isReadOnlyTeamAccess = level === 'oht' || level === 'view';

  // System admin can do everything on any team
  
  if (hasAnyGlobalFinanceRole()) {
    state.canTransferFunds = true;
    state.canManageIncome = true;
  }
  if (role === 'admin' || isFinanceGlobalAdmin()) {
    state.canCreateBuckets = true;
    state.canEditBuckets = true;
    state.canDeleteBuckets = role === 'admin';
    state.canCreateCategories = true;
    state.canEditCategories = true;
    state.canDeleteCategories = true;
    state.canCreateBudgets = true;
    state.canEditBudgets = true;
    state.canDeleteBudgets = true;
    state.canManageIncome = true;
    state.canTransferFunds = true;
    state.canManageExpenses = true;
    state.canViewAllExpenses = true;
    state.canViewTeamIncome = true;
    state.canViewTeamBudgets = true;
    state.canManageTeamRoster = true;
    state.canCreateOhtTeam = true;
    state.isReadOnlyTeamAccess = false;
    state.canSubmitReconciliation = true;
    return;
  }

  // Org roles (CAOH/OH/CEO) follow team access_level on each team — no bypass here.
  state.canViewTeamIncome = level === 'lead' || level === 'admin' || level === 'oht' || level === 'view';
  state.canViewTeamBudgets = state.canViewTeamIncome;
  state.canManageTeamRoster = level === 'oht';
  state.canCreateOhtTeam = level === 'oht';
  state.canSubmitReconciliation = level === 'member' || level === 'lead' || level === 'admin';

  state.canManageExpenses = level === 'member' || level === 'lead' || level === 'admin';
  state.canTransferFunds = state.canTransferFunds || level === 'member' || level === 'lead' || level === 'admin';
  state.canViewAllExpenses = level === 'admin' || level === 'lead' || level === 'oht' || level === 'view';

  // Team-level permissions based on access_level
  switch (level) {
    case 'admin':
      state.canCreateBuckets = true;
      state.canEditBuckets = true;
      state.canDeleteBuckets = true;
      state.canCreateCategories = true;
      state.canEditCategories = true;
      state.canDeleteCategories = true;
      state.canCreateBudgets = true;
      state.canEditBudgets = true;
      state.canDeleteBudgets = true;
      state.canManageIncome = true;
      state.canTransferFunds = true;
      state.canManageTeamRoster = true;
      state.canCreateOhtTeam = true;
      break;
    case 'lead':
      state.canCreateBuckets = true;
      state.canEditBuckets = true;
      state.canDeleteBuckets = false;
      state.canCreateCategories = true;
      state.canEditCategories = true;
      state.canDeleteCategories = false;
      state.canCreateBudgets = true;
      state.canEditBudgets = true;
      state.canDeleteBudgets = false;
      state.canManageIncome = true;
      state.canTransferFunds = true;
      state.canManageTeamRoster = false;
      state.canCreateOhtTeam = false;
      break;
    case 'oht':
      state.canCreateBuckets = false;
      state.canEditBuckets = false;
      state.canDeleteBuckets = false;
      state.canCreateCategories = false;
      state.canEditCategories = false;
      state.canDeleteCategories = false;
      state.canCreateBudgets = false;
      state.canEditBudgets = false;
      state.canDeleteBudgets = false;
      state.canManageIncome = state.canManageIncome || false;
      state.canTransferFunds = state.canTransferFunds || false;
      state.canManageExpenses = false;
      state.canViewAllExpenses = true;
      state.canManageTeamRoster = true;
      state.canCreateOhtTeam = true;
      break;
    case 'member':
      state.canCreateBuckets = false;
      state.canEditBuckets = false;
      state.canDeleteBuckets = false;
      state.canCreateCategories = false;
      state.canEditCategories = false;
      state.canDeleteCategories = false;
      state.canCreateBudgets = false;
      state.canEditBudgets = false;
      state.canDeleteBudgets = false;
      state.canManageIncome = state.canManageIncome || false;
      state.canTransferFunds = true;
      break;
    case 'view':
      state.canCreateBuckets = false;
      state.canEditBuckets = false;
      state.canDeleteBuckets = false;
      state.canCreateCategories = false;
      state.canEditCategories = false;
      state.canDeleteCategories = false;
      state.canCreateBudgets = false;
      state.canEditBudgets = false;
      state.canDeleteBudgets = false;
      state.canManageIncome = state.canManageIncome || false;
      state.canTransferFunds = state.canTransferFunds || false;
      state.canManageExpenses = false;
      state.canViewAllExpenses = true;
      break;
    default:
      state.canCreateBuckets = false;
      state.canEditBuckets = false;
      state.canDeleteBuckets = false;
      state.canCreateCategories = false;
      state.canEditCategories = false;
      state.canDeleteCategories = false;
      state.canCreateBudgets = false;
      state.canEditBudgets = false;
      state.canDeleteBudgets = false;
      state.canManageIncome = state.canManageIncome || false;
      state.canTransferFunds = state.canTransferFunds || false;
  }
}

export function hasAccess(minLevel) {
  const level = String(state.userTeamAccess?.access_level || 'member').toLowerCase().trim();
  const levels = { 'view': 1, 'member': 2, 'oht': 2.5, 'lead': 3, 'oh': 4, 'admin': 5 };
  const current = levels[level] || 2;
  const target = levels[minLevel] || 2;
  return current >= target;
}