import { isFinanceGlobalAdmin } from './appRoles.js';
// ==================== USER MANAGEMENT ACCESS (Phase 4C Lite) ====================
import { state } from '../state.js';

const ORG_ROLES = ['user', 'fin', 'fip', 'oh', 'caoh', 'ceo', 'admin'];

export function isOrgAdminUser() {
  return ['admin', 'caoh', 'oh', 'ceo'].includes(String(state.user?.role || '').toLowerCase());
}

export function canManageUsers() {
  return state.user?.role === 'admin' || isOrgAdminUser() || isFinanceGlobalAdmin();
}

/** Org roles the current user may assign when creating/editing users. */
export function assignableOrgRoles() {
  const actor = String(state.user?.role || 'user').toLowerCase();
  if (actor === 'admin') return [...ORG_ROLES];
  if (actor === 'caoh') return ['user', 'fin', 'fip', 'oh', 'ceo', 'caoh'];
  if (actor === 'oh') return ['user', 'fin', 'fip', 'oh'];
  if (actor === 'ceo') return ['user'];
  return ['user'];
}

export function orgRoleLabel(role) {
  const r = String(role || 'user').toLowerCase();
  const labels = {
    user: 'User',
    fin: 'Finance reviewer (FIN)',
    fip: 'Finance payments (FIP)',
    oh: 'Finance head (FIH)',
    caoh: 'Chief admin (CAO)',
    ceo: 'CEO',
    admin: 'System admin (SYS)'
  };
  return labels[r] || r;
}
