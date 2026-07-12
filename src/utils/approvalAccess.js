// ==================== APPROVAL ACCESS / ROLE RESOLUTION (Phase 4B) ====================
import { state } from '../state.js';
import { supabaseClient } from '../db.js';

export const REQUEST_TYPES = {
  BUDGET: 'budget',
  MONEY_TRANSFER: 'money_transfer'
};

export const ROLE_CODES = ['OPS', 'OPL', 'OPH', 'FIN', 'FIH', 'CAO', 'CEO', 'SYS', 'LEG', 'LEH', 'GUT', 'GUH'];

/** Org role → built-in approval role codes */
export function orgRoleToApprovalCodes(orgRole) {
  const role = String(orgRole || 'user').toLowerCase().trim();
  const codes = new Set();
  if (role === 'admin') codes.add('SYS');
  if (role === 'caoh') { codes.add('CAO'); codes.add('FIH'); }
  if (role === 'oh') codes.add('FIH');
  if (role === 'ceo') codes.add('CEO');
  return codes;
}

/** Team access_level → approval role code on that team */
export function teamAccessToRoleCode(accessLevel) {
  const level = String(accessLevel || '').toLowerCase().trim();
  if (level === 'oht') return 'OPH';
  if (level === 'lead') return 'OPL';
  if (level === 'member') return 'OPS';
  return null;
}

export function isFinalStatus(status) {
  const s = String(status || '').toUpperCase();
  return s === 'REJECTED' || s.endsWith('-APPROVED');
}

export function isActiveStatus(status) {
  const s = String(status || '').toUpperCase();
  if (isFinalStatus(s)) return false;
  return s === 'DRAFT' || s === 'SUBMITTED' || s.startsWith('CLARIFY-') || s.endsWith('-REVIEWED');
}

export function clarifyRoleFromStatus(status) {
  const s = String(status || '').toUpperCase();
  if (!s.startsWith('CLARIFY-')) return null;
  return s.slice('CLARIFY-'.length);
}

/** Resolve approval role codes for user on a team (sync, from state). */
export function getLocalRoleCodesForTeam(teamId) {
  const codes = orgRoleToApprovalCodes(state.user?.role);

  const team = (state.teams || []).find(t => t.team_id === teamId);
  if (team) {
    const mapped = teamAccessToRoleCode(team.access_level);
    if (mapped) codes.add(mapped);
  }

  return codes;
}

/** Load FIN/LEG/etc. assignments from DB and merge with local codes. */
export async function getUserApprovalRoleCodes(userId = state.user?.id, teamId = null) {
  const codes = teamId ? getLocalRoleCodesForTeam(teamId) : orgRoleToApprovalCodes(state.user?.role);

  if (!userId) return [...codes];

  let query = supabaseClient
    .from('request_role_assignments')
    .select('role_code, team_id')
    .eq('user_id', userId)
    .eq('is_active', true);

  const { data, error } = await query;
  if (error) {
    console.warn('request_role_assignments:', error);
    return [...codes];
  }

  (data || []).forEach(row => {
    if (!row.team_id || !teamId || row.team_id === teamId) {
      codes.add(String(row.role_code || '').toUpperCase());
    }
  });

  return [...codes];
}

export async function userCanActOnRequest(request, userId = state.user?.id) {
  if (!request || !userId) return false;
  if (state.user?.role === 'admin') return true;

  const status = String(request.status || '').toUpperCase();
  if (isFinalStatus(status)) return false;

  if (status.startsWith('CLARIFY-')) {
    const role = clarifyRoleFromStatus(status);
    const codes = await getUserApprovalRoleCodes(userId, request.team_id);
    return codes.includes(role) || request.created_by === userId;
  }

  if (request.current_role_code) {
    const codes = await getUserApprovalRoleCodes(userId, request.team_id);
    return codes.includes(String(request.current_role_code).toUpperCase());
  }

  return request.created_by === userId;
}

export function canManageRoleAssignments() {
  const role = String(state.user?.role || 'user').toLowerCase();
  return ['admin', 'oh', 'caoh'].includes(role);
}

export function canSubmitBudgetApproval() {
  if (state.user?.role === 'admin') return true;
  const level = String(state.userTeamAccess?.access_level || '').toLowerCase();
  return level === 'lead' || level === 'admin';
}
