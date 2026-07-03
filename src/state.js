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
  canManageExpenses: false,
  canViewAllExpenses: false,
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
    state.canManageExpenses = true;
    state.canViewAllExpenses = true;
    return;
  }

  state.canManageExpenses = level !== 'view';
  state.canViewAllExpenses = level === 'admin' || level === 'lead';

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
  }
}

export function hasAccess(minLevel) {
  const levels = { 'view': 1, 'member': 2, 'lead': 3, 'oh': 4, 'admin': 5 };
  const current = levels[state.userTeamAccess?.access_level || 'member'] || 2;
  const target = levels[minLevel] || 2;
  return current >= target;
}