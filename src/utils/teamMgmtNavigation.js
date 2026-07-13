// ==================== TEAM MGMT NAVIGATION HELPERS ====================

const PENDING_TEAM_KEY = 'kmPendingTeamMgmtTeamId';

/** Open Teams admin with a specific team pre-selected in the dropdown. */
export function navigateToTeamMgmt(teamId) {
  if (teamId) sessionStorage.setItem(PENDING_TEAM_KEY, teamId);
  else sessionStorage.removeItem(PENDING_TEAM_KEY);
  window.showPage('team-mgmt');
}

/** Read and clear pending team selection (used on Teams page init). */
export function consumePendingTeamMgmtTeamId() {
  const id = sessionStorage.getItem(PENDING_TEAM_KEY);
  sessionStorage.removeItem(PENDING_TEAM_KEY);
  return id || null;
}
