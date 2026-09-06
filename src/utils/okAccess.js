import { hasAnyGlobalFinanceRole } from './appRoles.js';
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
  },
  {
    code: 'tasks',
    label: 'Tasks',
    path: '/tasks',
    live: true,
    description: 'Unified Task Tracker'
  },
  {
    code: 'konnect',
    label: 'Konnect',
    path: '/konnect',
    live: true,
    description: 'Secure Monastery Chat Hub'
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
  { key: 'view-transfers', label: 'View Transfers' },
  { key: 'my-income', label: 'My Income' },
  { key: 'add-expense', label: 'Add Expense' },
  { key: 'expense-manager', label: 'Expense Manager' },
  { key: 'generate-receipt', label: 'Generate Receipt' },
  { key: 'financial-status', label: 'Treasury' },
  { key: 'reconcile', label: 'Reconcile' },
  { key: 'reconciliation-overview', label: 'Reconciliation Overview' },
  { key: 'reconciliation-approval', label: 'Reconciliation Approval' },
  { key: 'expense-reports', label: 'Expense Reports' },
  { key: 'team-report', label: 'Team Report' },
  { key: 'spending-pattern', label: 'Spending Pattern' },
  { key: 'my-finances', label: 'My Finances' },
  { key: 'team-mgmt', label: 'Teams' },
  { key: 'role-assignments', label: 'Role Assignments' },
  { key: 'user-mgmt', label: 'Users (Finance)' },
  { key: 'budget-calendar', label: 'Budget Calendar' },
  { key: 'category-master', label: 'Category Master' }
];

export function isOkAdmin() {
  return !!state.isOkAdmin || (state.user?.role === 'admin') || (state.okAppAdmins && state.okAppAdmins.length > 0);
}

export function hasAppAccess(appCode) {
  if (appCode === 'tasks' || appCode === 'konnect') return true;
  const globalRoles = ['admin', 'fin', 'fip', 'oh', 'caoh', 'cao', 'ceo', 'fih'];
  if (appCode === 'finance' && globalRoles.includes(String(state.user?.role || '').toLowerCase().trim())) {
    return true;
  }
  const apps = state.okApps || [];
  return apps.some(a => a.app_code === appCode && a.enabled === true);
}

export function hasMenuAccess(appCode, menuKey) {
  if (!hasAppAccess(appCode)) return false;
  
  if (state.isOkAdmin || state.user?.role === 'admin' || (state.okAppAdmins && state.okAppAdmins.includes(appCode))) return true;

  if (appCode === 'finance' && hasAnyGlobalFinanceRole()) {
    return true;
  }

  const menus = state.okMenus || [];
  if (!menus.length) return true;
  return menus.some(m => m.app_code === appCode && m.menu_key === menuKey && m.enabled !== false);
}

export function getAppMeta(code) {
  return OK_APPS.find(a => a.code === code) || null;
}

/** Load OK admin flag, app admins, apps, menus, pins into state. Scoped by team. */
export async function loadOkAccess(userId, teamId = null) {
  if (!userId) {
    state.isOkAdmin = false;
    state.okAppAdmins = [];
    state.okApps = [];
    state.okMenus = [];
    state.okPins = [];
    return;
  }

  const activeTeamId = teamId || state.currentTeam?.team_id;

  const [adminRes, appAdminRes, appsRes, menusRes, pinsRes] = await Promise.all([
    supabaseClient.from('ok_admins').select('user_id').eq('user_id', userId).maybeSingle(),
    supabaseClient.from('ok_app_admins').select('app_code').eq('user_id', userId),
    activeTeamId
      ? supabaseClient.from('ok_app_access').select('app_code, enabled').eq('user_id', userId).eq('team_id', activeTeamId)
      : supabaseClient.from('ok_app_access').select('app_code, enabled').eq('user_id', userId),
    activeTeamId
      ? supabaseClient.from('ok_menu_access').select('app_code, menu_key, enabled').eq('user_id', userId).eq('team_id', activeTeamId).eq('enabled', true)
      : supabaseClient.from('ok_menu_access').select('app_code, menu_key, enabled').eq('user_id', userId).eq('enabled', true),
    supabaseClient.from('ok_home_pins').select('app_code, sort_order').eq('user_id', userId).order('sort_order')
  ]);

  state.isOkAdmin = !!adminRes.data;
  state.okAppAdmins = (appAdminRes.data || []).map(a => a.app_code);
  state.okApps = (appsRes.data || []).filter(a => a.enabled === true);
  state.okMenus = menusRes.data || [];
  state.okPins = pinsRes.data || [];

  // Default Tasks and Konnect to enabled unless explicitly set to false
  if (activeTeamId) {
    const hasTasksRow = (appsRes.data || []).some(a => a.app_code === 'tasks');
    if (!hasTasksRow) {
      state.okApps.push({ app_code: 'tasks', enabled: true });
    }
    const hasKonnectRow = (appsRes.data || []).some(a => a.app_code === 'konnect');
    if (!hasKonnectRow) {
      state.okApps.push({ app_code: 'konnect', enabled: true });
    }
  }

  // Soft fallback only when tables are missing (migration not run)
  if (appsRes.error) {
    console.warn('ok_app_access load:', appsRes.error.message);
    state.okApps = [{ app_code: 'finance', enabled: true }];
    if (!state.okPins.length) state.okPins = [{ app_code: 'finance', sort_order: 0 }];
  }
}

export async function loadOkMessages(userId) {
  if (!userId) return [];
  try {
    await supabaseClient.rpc('prune_stale_ok_approval_messages', { p_user_id: userId });
  } catch (_) { /* older DB without prune */ }

  const { data, error } = await supabaseClient
    .from('ok_messages')
    .select('id, title, body, team_id, read_at, created_at, action_page, action_id, category')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(200);

  let messages = data || [];
  if (error) {
    console.warn('ok_messages load:', error.message);
    const fallback = await supabaseClient
      .from('ok_messages')
      .select('id, title, body, team_id, read_at, created_at, action_page, action_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(200);
    messages = fallback.data || [];
  }

  return enrichMessageCategories(messages);
}

/** Fill missing category from the linked approval request type. */
async function enrichMessageCategories(messages) {
  if (!messages.length) return messages;

  const ids = [...new Set(
    messages
      .filter(m => !m.category || m.category === 'other')
      .map(m => m.action_id)
      .filter(Boolean)
  )];

  if (!ids.length) return messages;

  const { data: reqs } = await supabaseClient
    .from('approval_requests')
    .select('id, request_type')
    .in('id', ids);

  const typeById = Object.fromEntries((reqs || []).map(r => [r.id, r.request_type]));

  return messages.map(m => {
    if (m.category && m.category !== 'other') return m;
    const fromReq = typeById[m.action_id];
    if (fromReq) return { ...m, category: fromReq };
    return { ...m, category: inferCategoryFromText(m) };
  });
}

function inferCategoryFromText(m) {
  const t = `${m.title || ''} ${m.body || ''}`.toLowerCase();
  if (t.includes('budget')) return 'budget';
  if (t.includes('transfer')) return 'money_transfer';
  if (t.includes('reconcil')) return 'reconciliation_adjustment';
  if (t.includes('gurukul')) return 'gurukul';
  if (t.includes('role')) return 'role_change';
  // Compact line ends with type label from notify: "...  Budget"
  const last = t.trim().split(/\s+/).pop();
  if (last === 'budget') return 'budget';
  if (last === 'transfer') return 'money_transfer';
  if (last === 'reconciliation') return 'reconciliation_adjustment';
  return 'other';
}

export async function markOkMessageRead(messageId) {
  await supabaseClient
    .from('ok_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('id', messageId)
    .is('read_at', null);
}

export async function markAllOkMessagesRead(userId) {
  if (!userId) return;
  await supabaseClient
    .from('ok_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null);
}

export async function saveNotificationMode(userId, mode) {
  const value = mode === 'detail' ? 'detail' : 'summary';
  const { error } = await supabaseClient
    .from('users')
    .update({ notification_mode: value })
    .eq('id', userId);
  if (error) throw error;
  if (state.user) state.user.notification_mode = value;
}

export function getNotificationMode() {
  return state.user?.notification_mode === 'detail' ? 'detail' : 'summary';
}

/**
 * Aggregate unread home messages by type (not a live DB queue count —
 * it's "how many open alerts are waiting for you right now").
 */
export function summarizeOkMessages(messages) {
  const unread = (messages || []).filter(m => !m.read_at);
  if (!unread.length) return [];

  const labels = {
    budget: 'budget request',
    money_transfer: 'transfer request',
    reconciliation_adjustment: 'reconciliation request',
    gurukul: 'gurukul request',
    role_change: 'role change request',
    other: 'other request'
  };

  const counts = {};
  unread.forEach(m => {
    const cat = String(m.category || inferCategoryFromText(m) || 'other').toLowerCase();
    counts[cat] = (counts[cat] || 0) + 1;
  });

  return Object.entries(counts).map(([cat, n]) => {
    const base = labels[cat] || 'request';
    const plural = n === 1 ? base : `${base}s`;
    return { category: cat, count: n, text: `You have ${n} ${plural}` };
  });
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
  if (lower === '/profile' || lower.startsWith('/profile/')) return 'ok-profile';
  if (lower === '/tasks' || lower.startsWith('/tasks/')) return 'tasks';
  if (lower === '/konnect' || lower.startsWith('/konnect/')) return 'konnect';
  return 'home';
}

export function navigateOk(path) {
  const target = path.startsWith('/') ? path : `/${path}`;
  if (window.location.pathname !== target) {
    window.history.pushState({}, '', target);
  }
  window.dispatchEvent(new PopStateEvent('popstate'));
}
