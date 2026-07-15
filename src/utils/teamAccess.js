import { state, computePermissions } from '../state.js';
import { supabaseClient } from '../db.js';
import { teamAccessLabel } from './roleLabels.js';

/** Load teams the user can access into state.teams */
export async function loadAccessibleTeams(userId = state.user?.id) {
  if (!userId) return [];

  const { data: teamsData, error: teamsError } = await supabaseClient
    .rpc('get_accessible_teams', { p_user_id: userId });

  let rawTeams = [];

  if (teamsError) {
    console.warn('get_accessible_teams error:', teamsError);
    const { data: fallbackTeams } = await supabaseClient
      .from('user_teams')
      .select('team_id, is_primary, access_level, teams:team_id(id, name, is_personal_team)')
      .eq('user_id', userId);

    if (fallbackTeams) {
      rawTeams = fallbackTeams.map(t => ({
        team_id: t.team_id,
        team_name: t.teams?.name || 'Unknown',
        is_primary: t.is_primary,
        access_level: t.access_level || 'member',
        is_personal_team: !!t.teams?.is_personal_team
      }));
    }
  } else {
    rawTeams = teamsData || [];
  }

  // FIN / FIH / etc. assigned via Role Assignments may have no user_teams row
  const roleTeams = await loadTeamsFromRoleAssignments(userId);
  rawTeams = [...rawTeams, ...roleTeams];

  // Fetch is_primary values from user_teams table for this user
  const { data: userTeamsList } = await supabaseClient
    .from('user_teams')
    .select('team_id, is_primary')
    .eq('user_id', userId);

  const primaryMap = {};
  if (userTeamsList) {
    userTeamsList.forEach(ut => {
      primaryMap[ut.team_id] = !!ut.is_primary;
    });
  }

  const seenTeamIds = new Set();
  state.teams = [];
  for (const team of rawTeams) {
    if (team && team.team_id && !seenTeamIds.has(team.team_id)) {
      seenTeamIds.add(team.team_id);
      team.is_primary = !!primaryMap[team.team_id];
      state.teams.push(team);
    }
  }

  const needsPersonalFlag = state.teams.some(t => t.is_personal_team === undefined);
  if (needsPersonalFlag && state.teams.length) {
    const teamIds = state.teams.map(t => t.team_id);
    const { data: teamMeta } = await supabaseClient
      .from('teams')
      .select('id, is_personal_team')
      .in('id', teamIds);

    const metaMap = Object.fromEntries((teamMeta || []).map(t => [t.id, !!t.is_personal_team]));
    state.teams.forEach(t => {
      if (t.is_personal_team === undefined) {
        t.is_personal_team = !!metaMap[t.team_id];
      }
    });
  }

  return state.teams;
}

/** Teams granted only through request_role_assignments (approvers without membership). */
async function loadTeamsFromRoleAssignments(userId) {
  const userRole = state.user?.role;
  const isGlobalFromUserRole = ['caoh', 'oh', 'ceo'].includes(userRole);

  const { data: assignments, error } = await supabaseClient
    .from('request_role_assignments')
    .select('team_id, role_code')
    .eq('user_id', userId)
    .eq('is_active', true);

  const safeAssignments = assignments || [];
  if (error) {
    console.warn('role-assignment teams:', error.message);
  }

  if (!isGlobalFromUserRole && !safeAssignments.length) {
    return [];
  }

  const specificIds = [...new Set(safeAssignments.map(a => a.team_id).filter(Boolean))];
  const hasGlobal = isGlobalFromUserRole || safeAssignments.some(a => !a.team_id);

  let teamsQuery = supabaseClient
    .from('teams')
    .select('id, name, is_personal_team');

  // Prefer assigned teams; global FIN/FIH gets all non-personal teams
  if (!hasGlobal && specificIds.length) {
    teamsQuery = teamsQuery.in('id', specificIds);
  }

  const { data: teams, error: teamsErr } = await teamsQuery;
  if (teamsErr) {
    console.warn('role-assignment team list:', teamsErr.message);
    return [];
  }

  return (teams || [])
    .filter(t => hasGlobal ? !t.is_personal_team : true)
    .filter(t => hasGlobal || specificIds.includes(t.id))
    .map(t => ({
      team_id: t.id,
      team_name: t.name || 'Unknown',
      is_primary: false,
      access_level: 'view',
      is_personal_team: !!t.is_personal_team,
      from_role_assignment: true
    }));
}

/** Keep or restore current team after teams list changes. */
export function syncCurrentTeamAfterReload(preferredTeamId = state.currentTeam?.team_id) {
  if (!state.teams.length) return;

  const match = preferredTeamId
    ? state.teams.find(t => t.team_id === preferredTeamId)
    : null;

  state.currentTeam = match || state.teams.find(t => t.is_primary) || state.teams[0];
  state.userTeamAccess = {
    access_level: String(state.currentTeam.access_level || 'member').toLowerCase().trim(),
    granted_by: state.currentTeam.granted_by,
    granted_at: state.currentTeam.granted_at
  };
  computePermissions();
}

export function populateTeamSwitcher() {
  const select = document.getElementById('teamSelect');
  if (!select || !state.currentTeam) return;
  select.innerHTML = '';

  state.teams.forEach(team => {
    const option = document.createElement('option');
    option.value = team.team_id;
    option.textContent = team.team_name + (team.is_primary ? ' ★' : '');
    if (team.team_id === state.currentTeam.team_id) {
      option.selected = true;
    }
    select.appendChild(option);
  });
}

export function updateAccessBadge() {
  const accessBadge = document.getElementById('userAccessLevel');
  if (accessBadge) {
    accessBadge.textContent = teamAccessLabel(state.userTeamAccess?.access_level);
  }
}

export async function refreshAccessibleTeams() {
  const preferredTeamId = state.currentTeam?.team_id;
  await loadAccessibleTeams();
  syncCurrentTeamAfterReload(preferredTeamId);
  populateTeamSwitcher();
  updateAccessBadge();
}
