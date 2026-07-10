import { state, computePermissions } from '../state.js';
import { supabaseClient } from '../db.js';

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
      .select('team_id, is_primary, access_level, teams:team_id(id, name)')
      .eq('user_id', userId);

    if (fallbackTeams) {
      rawTeams = fallbackTeams.map(t => ({
        team_id: t.team_id,
        team_name: t.teams?.name || 'Unknown',
        is_primary: t.is_primary,
        access_level: t.access_level || 'member'
      }));
    }
  } else {
    rawTeams = teamsData || [];
  }

  const seenTeamIds = new Set();
  state.teams = [];
  for (const team of rawTeams) {
    if (team && team.team_id && !seenTeamIds.has(team.team_id)) {
      seenTeamIds.add(team.team_id);
      state.teams.push(team);
    }
  }

  return state.teams;
}

/** Keep or restore current team after teams list changes. */
export function syncCurrentTeamAfterReload(preferredTeamId = state.currentTeam?.team_id) {
  if (!state.teams.length) return;

  const match = preferredTeamId
    ? state.teams.find(t => t.team_id === preferredTeamId)
    : null;

  state.currentTeam = match || state.teams.find(t => t.is_primary) || state.teams[0];
  state.userTeamAccess = {
    access_level: state.currentTeam.access_level || 'member',
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

export async function refreshAccessibleTeams() {
  const preferredTeamId = state.currentTeam?.team_id;
  await loadAccessibleTeams();
  syncCurrentTeamAfterReload(preferredTeamId);
  populateTeamSwitcher();

  const accessBadge = document.getElementById('userAccessLevel');
  if (accessBadge) {
    accessBadge.textContent = (state.userTeamAccess.access_level || 'member').toUpperCase();
  }
}
