// ==================== APPROVAL ACCESS / ROLE RESOLUTION (Phase 4B) ====================
import { state } from '../state.js';
import { supabaseClient } from '../db.js';

export const REQUEST_TYPES = {
  BUDGET: 'budget',
  MONEY_TRANSFER: 'money_transfer',
  RECONCILIATION_ADJUSTMENT: 'reconciliation_adjustment'
};

const flowStepsCache = new Map();
let userRoleAssignments = null;
let cachedUserId = null;

export function clearFlowStepsCache() {
  flowStepsCache.clear();
}

export function clearApprovalAccessCache() {
  userRoleAssignments = null;
  cachedUserId = null;
  flowStepsCache.clear();
}

export async function loadUserRoleAssignments(userId = state.user?.id) {
  if (!userId) return [];
  const { data, error } = await supabaseClient
    .from('request_role_assignments')
    .select('role_code, team_id')
    .eq('user_id', userId)
    .eq('is_active', true);
  if (error) {
    console.warn('request_role_assignments load failed:', error);
    return [];
  }
  userRoleAssignments = data || [];
  cachedUserId = userId;
  return userRoleAssignments;
}

export async function resolveFlowSteps(requestType, teamId = null, userId = null) {
  const cacheKey = `${requestType}:${teamId}:${userId}`;
  if (flowStepsCache.has(cacheKey)) {
    return flowStepsCache.get(cacheKey);
  }

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

  const result = match
    ? (match.approval_flow_steps || []).sort((a, b) => a.step_order - b.step_order)
    : [];

  flowStepsCache.set(cacheKey, result);
  return result;
}

export async function hasPassedCaoApproval(request) {
  if (!request) return false;
  try {
    const steps = await resolveFlowSteps(request.request_type, request.team_id);
    const caoStep = steps.find(s => String(s.role_code).toUpperCase() === 'CAO');
    if (!caoStep) return true; // If no CAO step defined, consider it passed CAO
    return request.current_step_order > caoStep.step_order || isFinalStatus(request.status);
  } catch (e) {
    console.warn('Failed to resolve flow steps for CAO check:', e);
    return false;
  }
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

export async function getUserApprovalRoleCodes(userId = state.user?.id, teamId = null) {
  let orgRole = state.user?.role;
  if (userId && userId !== state.user?.id) {
    try {
      const { data: profile } = await supabaseClient
        .from('users')
        .select('role')
        .eq('id', userId)
        .single();
      orgRole = profile?.role || 'user';
    } catch (e) {
      orgRole = 'user';
    }
  }

  const codes = teamId ? getLocalRoleCodesForTeam(teamId) : orgRoleToApprovalCodes(orgRole);

  if (!userId) return [...codes];

  if (!userRoleAssignments || cachedUserId !== userId) {
    await loadUserRoleAssignments(userId);
  }

  (userRoleAssignments || []).forEach(row => {
    if (!row.team_id || !teamId || row.team_id === teamId) {
      codes.add(String(row.role_code || '').toUpperCase());
    }
  });

  return [...codes];
}

export function canSkipLevel(userRoles, currentRole, request, steps) {
  const userRoleUpper = userRoles.map(r => String(r).toUpperCase());
  const curUpper = String(currentRole).toUpperCase();

  // 1. CAO, CEO, and admin have absolute bypass authority (can approve any step early)
  if (userRoleUpper.includes('CAO') || userRoleUpper.includes('CEO') || state.user?.role === 'admin') {
    return true;
  }

  if (!steps || !request) return false;

  const caoStep = steps.find(s => String(s.role_code).toUpperCase() === 'CAO');
  const userStep = steps.find(s => userRoleUpper.includes(String(s.role_code).toUpperCase()));
  if (!userStep || !caoStep) return false;

  // 2. If the request is currently in the payment stage (post-CAO) or AT the CAO step, no skip-level is allowed
  const currentStep = steps.find(s => s.step_order === request.current_step_order);
  if (currentStep && currentStep.step_order >= caoStep.step_order) {
    return false;
  }

  // 3. Before CAO approval, users can only skip-approve if their step is before the CAO step
  if (userStep.step_order < caoStep.step_order) {
    return true;
  }

  return false;
}

export async function userCanActOnRequest(request, userId = state.user?.id, approvedRequestIds = null) {
  if (!request || !userId) return false;

  const steps = await resolveFlowSteps(request.request_type, request.team_id);
  const caoStep = steps.find(s => String(s.role_code).toUpperCase() === 'CAO');
  const isPostCao = caoStep ? request.current_step_order > caoStep.step_order : false;

  if (!isPostCao) {
    if (approvedRequestIds) {
      if (approvedRequestIds.has(request.id)) return false;
    } else if (await hasUserApprovedRequest(request.id, userId)) {
      return false;
    }
  }

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
      if (canSkipLevel(upperCodes, request.current_role_code, request, steps)) {
        const currentStep = steps.find(s => s.step_order === request.current_step_order);
        if (currentStep) {
          const caoStep = steps.find(s => String(s.role_code).toUpperCase() === 'CAO');
          const isStandardUser = !upperCodes.includes('CAO') && !upperCodes.includes('CEO') && state.user?.role !== 'admin';
          
          const higherSteps = steps.filter(s => {
            if (s.step_order <= currentStep.step_order) return false;
            if (isStandardUser && caoStep && s.step_order >= caoStep.step_order) return false;
            return true;
          });
          
          const hasHigherRole = higherSteps.some(s => upperCodes.includes(String(s.role_code).toUpperCase()));
          if (hasHigherRole) {
            return true;
          }
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

export async function hasUserApprovedRequest(requestId, userId = state.user?.id) {
  if (!requestId || !userId) return false;
  try {
    const { data: msgs } = await supabaseClient
      .from('messages')
      .select('sender_id, body')
      .eq('metadata->>link_id', requestId)
      .eq('sender_id', userId);
    
    if (msgs && msgs.length > 0) {
      return msgs.some(m => {
        const b = String(m.body);
        return b.includes('[Approval System] Approved') || 
               b.includes('[Approval System] Rejected') || 
               b.includes('Approved and sent forward') ||
               b.includes('Approved request');
      });
    }
  } catch (err) {
    console.warn('Failed to check approval history:', err);
  }
  return false;
}
