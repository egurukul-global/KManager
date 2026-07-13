// ==================== ONE KAILASA ACCESS (Phase 4D) ====================
import { state } from '../state.js';
import { supabaseClient } from '../db.js';

export const OK_APPS = [
  {
    code: 'finance',
    label: 'Finance',
    path: '/finance',
    live: true,
    description: 'Ministry of Finance'
  },
  {
    code: 'gurukul',
    label: 'Gurukul',
    path: '/gurukul',
    live: false,
    description: 'Coming soon'
  },
  {
    code: 'utilities',
    label: 'Utilities',
    path: '/utilities',
    live: false,
    description: 'Coming soon'
  }
];

/** Finance menu keys (page ids) for OK Admin matrix. */
export const FINANCE_MENU_KEYS = [
  { key: 'dashboard', label: 'Dashboard overview' },
  { key: 'profile', label: 'My Profile' },
  { key: 'approval-portal', label: 'Approval Portal' },
  { key: 'buckets', label: 'Money Buckets' },
  { key: 'categories', label: 'Categories' },
  { key: 'rates', label: 'Exchange Rates' },
  { key: 'create-budget', label: 'Create Budget' },
  { key: 'view-budgets', label: 'View Budgets' },
  { key: 'add-funds', label: 'Add Income' },
  { key: 'income-manager', label: 'Income Manager' },
  { key: 'transfer', label: 'Transfer Funds' },
  { key: 'my-income', label: 'My Income' },
  { key: 'add-expense', label: 'Add Expense' },
  { key: 'expense-manager', label: 'Expense Manager' },
  { key: 'generate-receipt', label: 'Generate Receipt' },
  { key: 'financial-status', label: 'Treasury' },
  { key: 'reconcile', label: 'Reconcile' },
  { key: 'reconciliation-overview', label: 'Reconciliation Overview' },
  { key: 'reconciliation-approval', label: 'Reconciliation Approval' },
  { key: 'expense-reports', label: 'Expense Reports' },
  { key: 'my-finances', label: 'My Finances' },
  { key: 'team-mgmt', label: 'Teams' },
  { key: 'role-assignments', label: 'Role Assignments' },
  { key: 'user-mgmt', label: 'Users (Finance)' },
  { key: 'budget-calendar', label: 'Budget Calendar' },
  { key: 'category-master', label: 'Category Master' }
];

export function isOkAdmin() {
  return !!state.isOkAdmin;
}

export function hasAppAccess(appCode) {
  if (state.isOkAdmin) return true;
  const apps = state.okApps || [];
  return apps.some(a => a.app_code === appCode && a.enabled !== false);
}

export function hasMenuAccess(appCode, menuKey) {
  if (state.isOkAdmin) return true;
  if (!hasAppAccess(appCode)) return false;
  const menus = state.okMenus || [];
  // If no menu rows loaded yet, fall back to team role rules only (legacy)
  if (!menus.length) return true;
  return menus.some(m => m.app_code === appCode && m.menu_key === menuKey && m.enabled !== false);
}

export function getAppMeta(code) {
  return OK_APPS.find(a => a.code === code) || null;
}

/** Load OK admin flag, apps, menus, pins into state. */
export async function loadOkAccess(userId) {
  if (!userId) {
    state.isOkAdmin = false;
    state.okApps = [];
    state.okMenus = [];
    state.okPins = [];
    return;
  }

  const [adminRes, appsRes, menusRes, pinsRes] = await Promise.all([
    supabaseClient.from('ok_admins').select('user_id').eq('user_id', userId).maybeSingle(),
    supabaseClient.from('ok_app_access').select('app_code, enabled').eq('user_id', userId),
    supabaseClient.from('ok_menu_access').select('app_code, menu_key, enabled').eq('user_id', userId).eq('enabled', true),
    supabaseClient.from('ok_home_pins').select('app_code, sort_order').eq('user_id', userId).order('sort_order')
  ]);

  state.isOkAdmin = !!adminRes.data;
  state.okApps = appsRes.data || [];
  state.okMenus = menusRes.data || [];
  state.okPins = pinsRes.data || [];

  // Soft fallback if migration not run yet: treat as Finance-only
  if (appsRes.error || (!state.okApps.length && !state.isOkAdmin)) {
    state.okApps = [{ app_code: 'finance', enabled: true }];
    state.okPins = state.okPins?.length ? state.okPins : [{ app_code: 'finance', sort_order: 0 }];
  }
}

export async function loadOkMessages(userId) {
  if (!userId) return [];
  const { data, error } = await supabaseClient
    .from('ok_messages')
    .select('id, title, body, team_id, read_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) {
    console.warn('ok_messages load:', error.message);
    return [];
  }
  return data || [];
}

export async function markOkMessageRead(messageId) {
  await supabaseClient
    .from('ok_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('id', messageId)
    .is('read_at', null);
}

export async function saveOkHomePins(userId, appCodes) {
  await supabaseClient.from('ok_home_pins').delete().eq('user_id', userId);
  if (!appCodes.length) return;
  const rows = appCodes.map((code, i) => ({
    user_id: userId,
    app_code: code,
    sort_order: i
  }));
  const { error } = await supabaseClient.from('ok_home_pins').insert(rows);
  if (error) throw error;
  state.okPins = rows.map(r => ({ app_code: r.app_code, sort_order: r.sort_order }));
}

export function parseAppPath() {
  const raw = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
  const lower = raw.toLowerCase();
  if (lower === '/finance' || lower.startsWith('/finance/')) return 'finance';
  if (lower === '/gurukul' || lower.startsWith('/gurukul/')) return 'gurukul';
  if (lower === '/utilities' || lower.startsWith('/utilities/')) return 'utilities';
  if (lower === '/admin' || lower.startsWith('/admin/')) return 'ok-admin';
  return 'home';
}

export function navigateOk(path) {
  const target = path.startsWith('/') ? path : `/${path}`;
  if (window.location.pathname !== target) {
    window.history.pushState({}, '', target);
  }
  window.dispatchEvent(new PopStateEvent('popstate'));
}
