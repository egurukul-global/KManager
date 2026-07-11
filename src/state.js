// ==================== GLOBAL STATE ====================
export const state = {
  user: null,
  teams: [],
  currentTeam: null,
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
  isReadOnlyTeamAccess: false,
  showDeleted: false,
  pendingDeleteId: null,
  isOnline: navigator.onLine,
  syncInProgress: false,
  lastSync: null,
  teamDefaults: null,
  teamDefaultsTeamId: null
};

// ==================== PERMISSIONS ====================
export function computePermissions() {
  const level = state.userTeamAccess?.access_level || 'member';
  const role = state.user?.role || 'user';
  state.isReadOnlyTeamAccess = level === 'oht' || level === 'view';

  // Admin/CAOH/OH/CEO can do everything
  if (['admin', 'caoh', 'oh', 'ceo'].includes(role)) {
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
    state.canManageExpenses = true;
    state.canViewAllExpenses = true;
    state.canViewTeamIncome = true;
    state.canViewTeamBudgets = true;
    state.isReadOnlyTeamAccess = false;
    return;
  }

  state.canViewTeamIncome = level === 'lead' || level === 'admin' || level === 'oht' || level === 'view';
  state.canViewTeamBudgets = state.canViewTeamIncome;

  state.canManageExpenses = level === 'member' || level === 'lead' || level === 'admin';
  state.canTransferFunds = level === 'member' || level === 'lead' || level === 'admin';
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
      state.canManageIncome = false;
      state.canTransferFunds = false;
      state.canManageExpenses = false;
      state.canViewAllExpenses = true;
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
      state.canManageIncome = false;
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
      state.canManageIncome = false;
      state.canTransferFunds = false;
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
      state.canManageIncome = false;
      state.canTransferFunds = false;
  }
}

export function hasAccess(minLevel) {
  const levels = { 'view': 1, 'member': 2, 'lead': 3, 'oh': 4, 'admin': 5 };
  const current = levels[state.userTeamAccess?.access_level || 'member'] || 2;
  const target = levels[minLevel] || 2;
  return current >= target;
}