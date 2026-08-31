import { state } from '../state.js';

export function hasAppRoleGlobal(appCode, roleCode) {
  const r = String(state.user?.role || '').toLowerCase().trim();
  if (r === 'admin' || r === 'ceo') return true;
  
  // Legacy role fallback
  if (appCode === 'finance' && String(state.user?.role || '').toLowerCase().trim() === roleCode) return true;
  
  if (!state.appRoleAssignments) return false;
  return state.appRoleAssignments.some(r => r.app_code === appCode && r.role_code === roleCode && r.team_id === null);
}

export function hasAppRoleForTeam(appCode, roleCode, teamId) {
  const r = String(state.user?.role || '').toLowerCase().trim();
  if (r === 'admin' || r === 'ceo') return true;
  if (!state.appRoleAssignments) return false;
  
  // If they have the global role, they implicitly have it for any team
  if (hasAppRoleGlobal(appCode, roleCode)) return true;
  
  // Check if they have the specific team assignment
  return state.appRoleAssignments.some(r => r.app_code === appCode && r.role_code === roleCode && r.team_id === teamId);
}

export function getAppRolesForUser(appCode) {
  if (!state.appRoleAssignments) return [];
  return state.appRoleAssignments.filter(r => r.app_code === appCode).map(r => r.role_code);
}

export function isFinanceGlobalAdmin() {
  return hasAppRoleGlobal('finance', 'fih') || hasAppRoleGlobal('finance', 'cao') || hasAppRoleGlobal('finance', 'oh') || state.user?.role === 'admin' || state.user?.role === 'ceo';
}

export function hasAnyGlobalFinanceRole() {
  if (isFinanceGlobalAdmin()) return true;
  
  // Legacy role fallback
  if (['fih', 'fin', 'fip', 'cao', 'oh', 'caoh'].includes(String(state.user?.role || '').toLowerCase().trim())) return true;
  
  if (!state.appRoleAssignments) return false;
  return state.appRoleAssignments.some(r => r.app_code === 'finance' && r.team_id === null);
}

export function hasAnyFinanceRoleForTeam(teamId) {
  if (isFinanceGlobalAdmin()) return true;
  if (!state.appRoleAssignments) return false;
  return state.appRoleAssignments.some(r => r.app_code === 'finance' && (r.team_id === null || r.team_id === teamId));
}

export function getAllowedTeamsForFinanceRole(roleCode) {
  if (!state.appRoleAssignments) return [];
  // Returns 'global' if they have it globally, or an array of teamIds
  const assignments = state.appRoleAssignments.filter(r => r.app_code === 'finance' && r.role_code === roleCode);
  if (assignments.some(r => r.team_id === null)) return 'global';
  return assignments.map(r => r.team_id).filter(Boolean);
}
