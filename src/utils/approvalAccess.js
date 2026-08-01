// ==================== APPROVAL ACCESS / ROLE RESOLUTION (Phase 4B) ====================
import { state } from '../state.js';
import { supabaseClient } from '../db.js';

export const REQUEST_TYPES = {
  BUDGET: 'budget',
  MONEY_TRANSFER: 'money_transfer',
  RECONCILIATION_ADJUSTMENT: 'reconciliation_adjustment'
};

export async function resolveFlowSteps(requestType, teamId = null, userId = null) {
  const { data: flows, error } = await supabaseClient
    .from('approval_flow_definitions')
    .select(`
      id, request_type, team_id, user_id, priority,
      approval_flow_steps ( step_order, role_code, is_final )
    `)
    .eq('request_type', requestType)
    .eq('is_active', true)
    .order('priority', { ascending: false });

  if (error) throw error;

  const list = flows || [];
  const match =
    list.find(f => f.team_id === teamId && f.user_id === userId) ||
    list.find(f => f.team_id === teamId && !f.user_id) ||
    list.find(f => !f.team_id && f.user_id === userId) ||
    list.find(f => !f.team_id && !f.user_id);

  if (!match) return [];

  return (match.approval_flow_steps || [])
    .sort((a, b) => a.step_order - b.step_order);
}

export const ROLE_CODES = ['OPS', 'OPL', 'OPH', 'FIN', 'FIP', 'FIH', 'CAO', 'CEO', 'SYS', 'LEG', 'LEH', 'GUT', 'GUH'];

/** Org role → built-in approval role codes */
export function orgRoleToApprovalCodes(orgRole) {
  const role = String(orgRole || 'user').toLowerCase().trim();
  const codes = new Set();
  if (role === 'admin') codes.add('SYS');
  // Org titles map 1:1 to their approval step — not earlier/later steps
  if (role === 'caoh' || role === 'cao') codes.add('CAO');
  if (role === 'oh') codes.add('FIH');
  if (role === 'ceo') codes.add('CEO');
  if (role === 'fin') codes.add('FIN');
  if (role === 'fip') codes.add('FIP');
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

export function isClarifyForRequester(status) {
  const role = clarifyRoleFromStatus(status);
  return role === 'REQUESTER' || role === 'OPS' || role === 'OPL';
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

  const status = String(request.status || '').toUpperCase();
  if (isFinalStatus(status)) return false;

  // Only system admin may act outside their step
  if (state.user?.role === 'admin' && userId === state.user?.id) {
    if (request.created_by === userId && request.current_role_code && !status.startsWith('CLARIFY-')) {
      return false;
    }
    return !!request.current_role_code || status.startsWith('CLARIFY-');
  }

  if (status.startsWith('CLARIFY-')) {
    const role = clarifyRoleFromStatus(status);
    // Clarification from an approver is answered by the person who submitted
    if (role === 'REQUESTER' || !role) {
      return request.created_by === userId;
    }
    const codes = await getUserApprovalRoleCodes(userId, request.team_id);
    return codes.includes(role) || request.created_by === userId;
  }

  if (request.current_role_code) {
    if (request.created_by === userId) return false;

    const codes = await getUserApprovalRoleCodes(userId, request.team_id);
    const upperCodes = codes.map(c => String(c).toUpperCase());
    if (upperCodes.includes(String(request.current_role_code).toUpperCase())) {
      return true;
    }

    if (String(request.current_role_code).toUpperCase() === 'FIP') {
      if (upperCodes.includes('FIH') || upperCodes.includes('CAO')) {
        return true;
      }
    }

    // Skip level approvals: check if user has a role code defined at a HIGHER step in this flow
    try {
      const steps = await resolveFlowSteps(request.request_type, request.team_id);
      const currentStep = steps.find(s => s.step_order === request.current_step_order);
      if (currentStep) {
        const higherSteps = steps.filter(s => s.step_order > currentStep.step_order);
        const hasHigherRole = higherSteps.some(s => upperCodes.includes(String(s.role_code).toUpperCase()));
        if (hasHigherRole) {
          return true;
        }
      }
    } catch (e) {
      console.warn('Failed to resolve flow steps for skip-level check:', e);
    }
  }

  return request.created_by === userId;
}

export function canManageRoleAssignments() {
  const role = String(state.user?.role || 'user').toLowerCase();
  return ['admin', 'oh', 'caoh'].includes(role);
}

export function canCancelRequest(request, userId = state.user?.id) {
  if (!request || !userId) return false;
  if (state.user?.role === 'admin') return true;
  if (request.created_by !== userId) return false;
  const status = String(request.status || '').toUpperCase();
  if (status === 'DRAFT') return false;
  if (isFinalStatus(status)) return false;
  return isActiveStatus(status);
}

export function canSubmitBudgetApproval() {
  if (state.user?.role === 'admin') return true;
  const level = String(state.userTeamAccess?.access_level || '').toLowerCase();
  return level === 'lead' || level === 'admin';
}
