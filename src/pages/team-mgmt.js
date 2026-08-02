// ==================== TEAM MANAGEMENT (ADMIN) ====================
import { state } from '../state.js';
import { supabaseClient } from '../db.js';
import { showToast, showConfirm } from '../components/toasts.js';
import { cardRow } from '../utils/uiHelpers.js';
import { refreshAccessibleTeams } from '../utils/teamAccess.js';
import { ensurePersonalTeamForUser } from '../utils/personalTeamHelpers.js';
import { ensureMemberBucketOnWorkTeam } from '../utils/memberBucketHelpers.js';
import { findNonZeroBucketsOnTeam, formatNonZeroBucketList } from '../utils/balanceGuards.js';
import { consumePendingTeamMgmtTeamId } from '../utils/teamMgmtNavigation.js';

const ACCESS_LEVELS = [
  { value: 'view', label: 'View only' },
  { value: 'member', label: 'Member (OPS — operations staff)' },
  { value: 'lead', label: 'Team lead (OPL)' },
  { value: 'oht', label: 'Operations head (OPH — per this team)' },
  { value: 'admin', label: 'Team admin (full team access)' }
];

let teamsCache = [];
let usersCache = [];
let membersCache = [];
let activeTeamId = null;

function isOrgAdmin() {
  return ['admin', 'caoh', 'oh', 'ceo'].includes(state.user?.role);
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(text) {
  return escapeHtml(text).replace(/'/g, '&#39;');
}

function userLabel(user) {
  if (!user) return 'Unknown';
  const name = user.name?.trim();
  const email = user.email?.trim();
  if (name && email) return `${name} (${email})`;
  return name || email || 'Unknown';
}

function getRoleLabelForTeam(accessLevel, team) {
  const dept = String(team?.department || '').trim();
  if (!dept) {
    if (accessLevel === 'member') return 'Member (OPS)';
    if (accessLevel === 'lead') return 'Team lead (OPL)';
    if (accessLevel === 'oht') return 'Operations head (OPH)';
    if (accessLevel === 'view') return 'View only';
    if (accessLevel === 'admin') return 'Team admin';
    return accessLevel;
  }

  const deptLower = dept.toLowerCase();
  if (deptLower === 'finance') {
    if (accessLevel === 'member') return 'Finance Officer (OPS)';
    if (accessLevel === 'lead') return 'Finance Lead (OPL)';
    if (accessLevel === 'oht') return 'Finance Head (OPH)';
  } else if (deptLower === 'legal') {
    if (accessLevel === 'member') return 'Legal Associate (OPS)';
    if (accessLevel === 'lead') return 'Legal Lead (OPL)';
    if (accessLevel === 'oht') return 'Legal Head (OPH)';
  } else if (deptLower === 'gurukul') {
    if (accessLevel === 'member') return 'Gurukul Teacher (OPS)';
    if (accessLevel === 'lead') return 'Gurukul Coordinator (OPL)';
    if (accessLevel === 'oht') return 'Gurukul Principal (OPH)';
  }

  if (accessLevel === 'member') return `${dept} Member (OPS)`;
  if (accessLevel === 'lead') return `${dept} Lead (OPL)`;
  if (accessLevel === 'oht') return `${dept} Head (OPH)`;
  if (accessLevel === 'view') return 'View only';
  if (accessLevel === 'admin') return 'Team admin';
  return accessLevel;
}

function canAccessTeamsPage() {
  return isOrgAdmin() || !!state.canManageTeamRoster;
}

function canCreateTeamsOnPage() {
  return isOrgAdmin() || !!state.canCreateOhtTeam;
}

function memberAccessOptions(selected = 'member', team = null) {
  const levels = isOrgAdmin() ? ACCESS_LEVELS : OHT_ASSIGNABLE_LEVELS;
  return levels.map(l => {
    const sel = l.value === selected ? ' selected' : '';
    const label = team ? getRoleLabelForTeam(l.value, team) : l.label;
    return `<option value="${l.value}"${sel}>${label}</option>`;
  }).join('');
}

export function getTeamMgmtPage() {
  if (!canAccessTeamsPage()) {
    return `
      <h1 class="page-title">Teams</h1>
      <div class="card"><h2>⛔ Access Denied</h2><p>You do not have permission to manage teams.</p></div>
    `;
  }

  const createBlock = canCreateTeamsOnPage() ? `
    <div class="card" id="teamsCreateCard" style="display:none;">
      <h2>➕ New Team</h2>
      ${isOrgAdmin() ? `
        <form id="teamForm" onsubmit="window.saveTeam(event)">
          <div class="form-group">
            <label>Team Name *</label>
            <input type="text" id="teamCreateName" required placeholder="e.g. Mumbai Outreach" maxlength="120">
          </div>
          <div class="form-group" style="margin-top:10px;">
            <label for="teamCreateType">Team Type</label>
            <input type="text" id="teamCreateType" placeholder="e.g. Department, Outreach, Division" value="Department">
          </div>
          <div class="form-group" style="margin-top:10px;">
            <label for="teamCreateDepartment">Department</label>
            <input type="text" id="teamCreateDepartment" placeholder="e.g. Finance, Administration, Kitchen">
          </div>
          <div class="form-group" style="margin-top:10px;">
            <label for="teamCreatePrefix">Team Prefix *</label>
            <input type="text" id="teamCreatePrefix" placeholder="e.g. GBB, DUB" maxlength="5" style="text-transform: uppercase; width: 100%;">
          </div>
          <div class="form-group" style="margin-top:10px; margin-bottom:12px;">
            <label for="teamCreateGenderScope">Gender Scope *</label>
            <select id="teamCreateGenderScope" required style="width:100%;">
              <option value="mixed">Mixed</option>
              <option value="male">Male only</option>
              <option value="female">Female only</option>
            </select>
          </div>
          <div class="btn-group">
            <button type="submit">Create Team</button>
            <button type="button" class="secondary" onclick="window.toggleTeamsCreateCard(false)">Cancel</button>
          </div>
        </form>
      ` : `
        <p class="page-intro">New teams are created under your OPH scope. You are assigned as OPH on the new team.</p>
        <form id="ohtCreateTeamForm" onsubmit="window.createOhtTeam(event)">
          <div class="form-group">
            <label>Team Name *</label>
            <input type="text" id="ohtNewTeamName" required placeholder="e.g. Lagos Outreach" maxlength="120">
          </div>
          <div class="form-group" style="margin-top:10px;">
            <label for="ohtNewTeamType">Team Type</label>
            <input type="text" id="ohtNewTeamType" placeholder="e.g. Department, Outreach, Division" value="Department">
          </div>
          <div class="form-group" style="margin-top:10px;">
            <label for="ohtNewTeamDepartment">Department</label>
            <input type="text" id="ohtNewTeamDepartment" placeholder="e.g. Finance, Administration, Kitchen">
          </div>
          <div class="form-group" style="margin-top:10px;">
            <label for="ohtNewTeamPrefix">Team Prefix *</label>
            <input type="text" id="ohtNewTeamPrefix" placeholder="e.g. GBB, DUB" maxlength="5" style="text-transform: uppercase; width: 100%;">
          </div>
          <div class="form-group" style="margin-top:10px; margin-bottom:12px;">
            <label for="ohtNewTeamGenderScope">Gender Scope *</label>
            <select id="ohtNewTeamGenderScope" required style="width:100%;">
              <option value="mixed">Mixed</option>
              <option value="male">Male only</option>
              <option value="female">Female only</option>
            </select>
          </div>
          <div class="btn-group">
            <button type="submit">Create Team</button>
            <button type="button" class="secondary" onclick="window.toggleTeamsCreateCard(false)">Cancel</button>
          </div>
        </form>
      `}
    </div>
  ` : '';

  return `
    <h1 class="page-title">Teams</h1>
    <p class="page-intro">Select a team to manage members. Create teams if your role allows.</p>

    <div class="card" style="margin-bottom: 24px;">
      <div class="form-grid-row form-grid-row--team-picker" style="display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-end;">
        <div class="form-group" style="width: 220px; margin-bottom: 0;">
          <label for="teamsPageSearch">Filter List</label>
          <input type="text" id="teamsPageSearch" placeholder="🔍 Type to filter..." oninput="window.filterTeamsDropdown()" style="width:100%; height:38px; border-radius:6px; border:1px solid var(--border); padding:6px 12px; background:var(--card-bg); color:var(--text); box-sizing:border-box;">
        </div>
        <div class="form-group" style="flex:1; min-width: 180px; margin-bottom: 0;">
          <label for="teamsPageSelect">Team</label>
          <select id="teamsPageSelect" onchange="window.onTeamsPageSelectChange()" style="width: 100%; height:38px; border-radius:6px; border:1px solid var(--border); padding:6px; background:var(--card-bg); color:var(--text);">
            <option value="">Loading teams…</option>
          </select>
        </div>
        <div class="form-group team-picker-actions">
          <label>&nbsp;</label>
          <div class="btn-group">
            ${canCreateTeamsOnPage() ? '<button type="button" class="success" onclick="window.toggleTeamsCreateCard(true)">+ New team</button>' : ''}
          </div>
        </div>
      </div>
      ${isOrgAdmin() ? `
        <form id="teamRenameForm" style="display:none; margin-top:20px; border-top:1px solid var(--border); padding-top:20px;" onsubmit="window.saveTeamRename(event)">
          <div class="form-grid-row" style="display: flex; gap: 16px; align-items: flex-end; flex-wrap: wrap;">
            <div class="form-group" style="flex: 1; min-width: 180px;">
              <label for="teamRenameName">Rename Team</label>
              <input type="text" id="teamRenameName" required maxlength="120" placeholder="Edit team name">
            </div>
            <div class="form-group" style="width: 150px;">
              <label for="teamRenameType">Team Type</label>
              <input type="text" id="teamRenameType" placeholder="Team type">
            </div>
            <div class="form-group" style="width: 150px;">
              <label for="teamRenameDepartment">Department</label>
              <input type="text" id="teamRenameDepartment" placeholder="Department">
            </div>
            <div class="form-group" style="width: 100px;">
              <label for="teamRenamePrefix">Prefix</label>
              <input type="text" id="teamRenamePrefix" placeholder="Prefix" maxlength="5" style="text-transform: uppercase;">
            </div>
            <div class="form-group" style="width: 150px;">
              <label for="teamRenameGenderScope">Gender Scope</label>
              <select id="teamRenameGenderScope" style="width:100%; height:38px; border-radius:6px; border:1px solid var(--border); padding:6px; background:var(--card-bg); color:var(--text);">
                <option value="mixed">Mixed</option>
                <option value="male">Male only</option>
                <option value="female">Female only</option>
              </select>
            </div>
            <div class="form-group" style="margin-bottom: 2px; display: flex; gap: 8px;">
              <button type="submit">Save settings</button>
              <button type="button" class="danger" onclick="window.deleteTeam()">Delete team</button>
            </div>
          </div>
        </form>
      ` : ''}
    </div>

    ${createBlock}

    <div class="card team-members-panel" id="teamMembersPanel">
      <h2 id="teamMembersTitle">Members</h2>
      <p id="teamsMembersHint" class="page-intro">Select a team above. Team access (OPS/OPL/OPH) is set here. Approval roles FIN, FIH, CAO are assigned separately under Admin → Role Assignments or on the user account.</p>

      <div id="memberSearchGroup" style="display:none; margin-bottom:15px; max-width:320px;">
        <input type="text" id="memberSearchInput" placeholder="🔍 Search users to add..." oninput="window.filterTeamMembers()" style="height:38px; box-sizing:border-box; width:100%; padding:8px 10px; border:2px solid var(--border); border-radius:var(--radius-sm); font-size:15px;">
      </div>

      <form id="addMemberForm" class="team-add-member-form" onsubmit="window.addTeamMember(event)" style="display:none;">
        <input type="hidden" id="memberTeamId">
        <div class="form-grid-row form-grid-row--team-member">
          <div class="form-group">
            <label>Add User *</label>
            <select id="memberUserId" required>
              <option value="">Select user…</option>
            </select>
          </div>
          <div class="form-group form-group--access-level">
            <label>Access Level *</label>
            <select id="memberAccessLevel" class="team-access-select" required>
              ${memberAccessOptions('member')}
            </select>
          </div>
          <div class="form-group team-add-member-form__actions">
            <label>&nbsp;</label>
            <button type="submit">Add Member</button>
          </div>
        </div>
      </form>

      <div class="table-container show-desktop">
        <table class="table-stack-mobile team-mgmt-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Access</th>
              ${isOrgAdmin() ? '<th>Default</th>' : ''}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="teamMembersBody">
            <tr><td colspan="${isOrgAdmin() ? 4 : 3}" class="empty-state">Select a team.</td></tr>
          </tbody>
        </table>
      </div>
      <div id="teamMembersMobile" class="show-mobile data-card-list"></div>
    </div>

    <div class="card team-relationships-panel" id="teamRelationshipsPanel" style="display:none; margin-top:24px;">
      <h2>🔗 Team Hierarchy & Relationships</h2>
      <p class="page-intro">Configure parent and sub-team associations for the selected team.</p>
      
      <div class="form-grid-row" style="display:flex; gap:16px; margin-bottom:20px; flex-wrap:wrap; align-items: stretch;">
        <div class="form-group" style="width:250px; margin-bottom: 0;">
          <label for="relTeamSearch">Search Teams</label>
          <input type="text" id="relTeamSearch" placeholder="🔍 Type to filter..." oninput="window.filterRelTeamsList()" style="width:100%; height:38px; box-sizing:border-box;">
        </div>
        <div class="form-group" style="flex:1.5; min-width: 250px; margin-bottom: 0; display:flex; flex-direction:column;">
          <label style="display:flex; align-items:center; gap:6px; font-weight: 600;">
            <input type="checkbox" id="relSelectAllTeams" onchange="window.toggleAllRelTeams(this.checked)"> 
            Select Teams to Associate
          </label>
          <div id="relTeamsChecklist" style="border:1px solid var(--border); border-radius:6px; background:var(--card-bg); max-height:120px; overflow-y:auto; padding:8px; display:flex; flex-direction:column; gap:6px; margin-top:4px; flex:1;">
            <!-- Generated dynamically -->
          </div>
        </div>
        <div class="form-group" style="width:300px; margin-bottom: 0; display:flex; flex-direction:column;">
          <label for="relTypeSelect">Relationship Type</label>
          <select id="relTypeSelect" style="width:100%; height:38px; margin-top:4px;">
            <option value="child">are Sub-teams (Children) of this team</option>
            <option value="parent">are Parent Teams of this team</option>
          </select>
          <button type="button" onclick="window.addTeamRelationship()" style="height:38px; margin-top: auto; width:100%;">Add Relationships</button>
        </div>
      </div>
      
      <div style="display:flex; gap:20px; flex-wrap:wrap;">
        <div class="relationship-list-col" style="flex:1; min-width:220px; background:var(--bg-secondary); padding:12px; border-radius:6px; border:1px solid var(--border);">
          <h4 style="margin:0 0 10px;">Parent Teams</h4>
          <ul id="parentTeamsList" style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:6px;">
            <li class="empty-state">No parent teams</li>
          </ul>
        </div>
        <div class="relationship-list-col" style="flex:1; min-width:220px; background:var(--bg-secondary); padding:12px; border-radius:6px; border:1px solid var(--border);">
          <h4 style="margin:0 0 10px;">Sub-teams (Children)</h4>
          <ul id="childTeamsList" style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:6px;">
            <li class="empty-state">No sub-teams</li>
          </ul>
        </div>
      </div>
    </div>
  `;
}

export async function initTeamMgmtPage() {
  if (!canAccessTeamsPage()) return;

  window.saveTeam = saveTeam;
  window.saveTeamRename = saveTeamRename;
  window.resetTeamForm = resetTeamForm;
  window.addTeamMember = addTeamMember;
  window.updateMemberAccess = updateMemberAccess;
  window.setMemberPrimary = setMemberPrimary;
  window.removeTeamMember = removeTeamMember;
  window.onTeamsPageSelectChange = onTeamsPageSelectChange;
  window.toggleTeamsCreateCard = toggleTeamsCreateCard;
  window.createOhtTeam = createOhtTeam;
  window.filterTeamMembers = filterTeamMembers;
  window.filterTeamsDropdown = filterTeamsDropdown;
  window.deleteTeam = deleteTeam;
  window.addTeamRelationship = addTeamRelationship;
  window.removeTeamRelationship = removeTeamRelationship;
  window.filterRelTeamsList = filterRelTeamsList;
  window.toggleAllRelTeams = toggleAllRelTeams;

  await loadUsersCache();
  await loadManageableTeams();
}

function filterTeamsDropdown() {
  const q = (document.getElementById('teamsPageSearch')?.value || '').trim().toLowerCase();
  const select = document.getElementById('teamsPageSelect');
  if (!select) return;

  const currentVal = select.value;
  const matched = teamsCache.filter(t => t.name.toLowerCase().includes(q));

  select.innerHTML = matched.length
    ? '<option value="">Select a team…</option>'
    : '<option value="">No matching teams</option>';

  matched.forEach(team => {
    select.innerHTML += `<option value="${team.id}">${escapeHtml(team.name)}</option>`;
  });

  if (matched.some(t => t.id === currentVal)) {
    select.value = currentVal;
  } else {
    select.value = '';
  }
}

async function loadManageableTeams() {
  const select = document.getElementById('teamsPageSelect');
  if (!select) return;

  const searchInput = document.getElementById('teamsPageSearch');
  if (searchInput) searchInput.value = '';

  try {
    if (isOrgAdmin()) {
      const { data: teams, error } = await supabaseClient
        .from('teams')
        .select('id, name, is_personal_team, has_budget_access, has_tasks_access, has_lms_access, gender_scope, team_type, department')
        .eq('is_personal_team', false)
        .order('name');
      if (error) throw error;
      teamsCache = (teams || []).map(t => ({
        id: t.id,
        name: t.name,
        has_budget_access: t.has_budget_access,
        has_tasks_access: t.has_tasks_access,
        has_lms_access: t.has_lms_access,
        gender_scope: t.gender_scope || 'mixed',
        team_type: t.team_type || 'Department',
        department: t.department || '',
        member_count: 0
      }));
    } else {
      // For non-admin, load OHT scope teams from DB directly to get types/departments
      const ohtTeamIds = (state.teams || [])
        .filter(t => String(t.access_level || '').toLowerCase() === 'oht')
        .map(t => t.team_id);
      
      const { data: teams, error } = await supabaseClient
        .from('teams')
        .select('id, name, is_personal_team, has_budget_access, has_tasks_access, has_lms_access, gender_scope, team_type, department')
        .in('id', ohtTeamIds)
        .order('name');
      if (error) throw error;

      teamsCache = (teams || []).map(t => ({
        id: t.id,
        name: t.name,
        has_budget_access: t.has_budget_access,
        has_tasks_access: t.has_tasks_access,
        has_lms_access: t.has_lms_access,
        gender_scope: t.gender_scope || 'mixed',
        team_type: t.team_type || 'Department',
        department: t.department || '',
        member_count: 0
      }));
    }

    select.innerHTML = teamsCache.length
      ? '<option value="">Select a team…</option>'
      : '<option value="">No teams available</option>';

    teamsCache.forEach(team => {
      select.innerHTML += `<option value="${team.id}">${escapeHtml(team.name)}</option>`;
    });

    const pendingTeamId = consumePendingTeamMgmtTeamId();
    const preferred = pendingTeamId || activeTeamId || state.currentTeam?.team_id;
    if (preferred && teamsCache.some(t => t.id === preferred)) {
      select.value = preferred;
      await onTeamsPageSelectChange();
    }
  } catch (err) {
    console.error('Load manageable teams:', err);
    select.innerHTML = `<option value="">Error: ${escapeHtml(err.message)}</option>`;
  }
}

async function onTeamsPageSelectChange() {
  const teamId = document.getElementById('teamsPageSelect')?.value;
  const form = document.getElementById('addMemberForm');
  const hint = document.getElementById('teamsMembersHint');
  const title = document.getElementById('teamMembersTitle');
  const renameRow = document.getElementById('teamRenameForm');
  const renameInput = document.getElementById('teamRenameName');
  const searchGroup = document.getElementById('memberSearchGroup');

  if (!teamId) {
    activeTeamId = null;
    membersCache = [];
    if (form) form.style.display = 'none';
    if (searchGroup) searchGroup.style.display = 'none';
    if (hint) hint.style.display = '';
    if (title) title.textContent = 'Members';
    if (renameRow) renameRow.style.display = 'none';
    const relPanel = document.getElementById('teamRelationshipsPanel');
    if (relPanel) relPanel.style.display = 'none';
    const tbody = document.getElementById('teamMembersBody');
    if (tbody) {
      const cols = isOrgAdmin() ? 4 : 3;
      tbody.innerHTML = `<tr><td colspan="${cols}" class="empty-state">Select a team.</td></tr>`;
    }
    const mobile = document.getElementById('teamMembersMobile');
    if (mobile) mobile.innerHTML = '';
    return;
  }

  const team = teamsCache.find(t => t.id === teamId);
  activeTeamId = teamId;
  if (title) title.textContent = `Members — ${team?.name || 'Team'}`;
  if (hint) hint.style.display = 'none';
  if (form) form.style.display = '';
  if (searchGroup) searchGroup.style.display = '';
  if (renameRow && renameInput && isOrgAdmin()) {
    renameRow.style.display = '';
    renameInput.value = team?.name || '';
    const checkGenderScope = document.getElementById('teamRenameGenderScope');
    if (checkGenderScope) checkGenderScope.value = team?.gender_scope || 'mixed';
    const checkType = document.getElementById('teamRenameType');
    if (checkType) checkType.value = team?.team_type || 'Department';
    const checkDept = document.getElementById('teamRenameDepartment');
    if (checkDept) checkDept.value = team?.department || '';
    const checkPrefix = document.getElementById('teamRenamePrefix');
    if (checkPrefix) checkPrefix.value = team?.prefix || '';
  }
  document.getElementById('memberTeamId').value = teamId;

  const relPanel = document.getElementById('teamRelationshipsPanel');
  if (relPanel) {
    relPanel.style.display = '';
    loadTeamRelationships(teamId);
    populateRelationshipChecklist(teamId);
  }

  const teamMatch = state.teams.find(t => t.team_id === teamId);
  if (teamMatch) {
    state.currentTeam = teamMatch;
    state.userTeamAccess = {
      access_level: String(teamMatch.access_level || 'member').toLowerCase().trim(),
      granted_by: teamMatch.granted_by,
      granted_at: teamMatch.granted_at
    };
    const { computePermissions } = await import('../state.js');
    computePermissions();
    
    const topSelect = document.getElementById('teamSelect');
    if (topSelect) topSelect.value = teamId;
    
    const accessBadge = document.getElementById('userAccessLevel');
    if (accessBadge) {
      const { teamAccessLabel } = await import('../utils/roleLabels.js');
      accessBadge.textContent = teamAccessLabel(state.userTeamAccess.access_level);
    }
  }

  await loadTeamMembers(teamId);
  populateAddMemberUserSelect(teamId);
  await backfillMemberBucketsForTeam(teamId);
}

function toggleTeamsCreateCard(show) {
  const card = document.getElementById('teamsCreateCard');
  if (card) card.style.display = show ? '' : 'none';
}

export function getTeamRosterPage() {
  return getTeamMgmtPage();
}

export async function initTeamRosterPage() {
  await initTeamMgmtPage();
}

async function loadUsersCache() {
  try {
    const { data, error } = await supabaseClient
      .from('users')
      .select('id, name, email, role')
      .order('name');

    usersCache = error ? [] : (data || []);
  } catch (err) {
    console.warn('Failed to load users:', err);
    usersCache = [];
  }
}

async function backfillMemberBucketsForTeam(teamId) {
  const team = teamsCache.find(t => t.id === teamId);
  if (!team) return;

  for (const member of membersCache) {
    const user = member.user || usersCache.find(u => u.id === member.user_id);
    try {
      await ensureMemberBucketOnWorkTeam(
        teamId,
        member.user_id,
        user?.name || user?.email,
        state.user?.id
      );
    } catch (err) {
      console.warn('Backfill member bucket:', member.user_id, err);
    }
  }
}

function resetTeamForm() {
  document.getElementById('teamForm')?.reset();
}

async function saveTeam(e) {
  e.preventDefault();
  const name = document.getElementById('teamCreateName')?.value?.trim();

  if (!name) {
    showToast('Enter a team name', 'error');
    return;
  }

  const duplicate = teamsCache.find(t => t.name.toLowerCase() === name.toLowerCase());
  if (duplicate) {
    showToast('A team with this name already exists', 'error');
    return;
  }

  const btn = e.target.querySelector('button[type="submit"]');
  const originalText = btn.textContent;
  btn.textContent = 'Creating…';
  btn.disabled = true;

  try {
    const newId = crypto.randomUUID();
    const genderScope = document.getElementById('teamCreateGenderScope')?.value || 'mixed';
    const teamType = document.getElementById('teamCreateType')?.value?.trim() || 'Department';
    const department = document.getElementById('teamCreateDepartment')?.value?.trim() || '';
    let prefix = document.getElementById('teamCreatePrefix')?.value?.trim()?.toUpperCase() || '';

    if (!prefix) {
      const cleaned = name.replace(/\s+/g, '');
      const base = cleaned.slice(0, Math.min(3, cleaned.length)).toUpperCase() || 'TSK';
      prefix = base;
      let counter = 1;
      while (teamsCache.some(t => t.prefix?.toUpperCase() === prefix)) {
        prefix = base.slice(0, 2) + counter.toString();
        counter++;
      }
    } else {
      const prefixDuplicate = teamsCache.find(t => t.prefix?.toUpperCase() === prefix);
      if (prefixDuplicate) {
        showToast('A team with this prefix already exists', 'error');
        btn.textContent = originalText;
        btn.disabled = false;
        return;
      }
    }

    const { error } = await supabaseClient.from('teams').insert({
      id: newId,
      name,
      gender_scope: genderScope,
      team_type: teamType,
      department: department,
      prefix: prefix
    });
    if (error) throw error;
    showToast('Team created', 'success');

    await supabaseClient.from('user_teams').insert({
      id: crypto.randomUUID(),
      user_id: state.user.id,
      team_id: newId,
      access_level: 'admin',
      is_primary: false
    });
    activeTeamId = newId;

    resetTeamForm();
    toggleTeamsCreateCard(false);
    await loadManageableTeams();
    const select = document.getElementById('teamsPageSelect');
    if (select) select.value = newId;
    await onTeamsPageSelectChange();
    await refreshAccessibleTeams();
  } catch (err) {
    console.error('Save team error:', err);
    showToast(err.message || 'Failed to create team', 'error');
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

async function saveTeamRename(e) {
  e.preventDefault();
  const teamId = activeTeamId || document.getElementById('teamsPageSelect')?.value;
  const name = document.getElementById('teamRenameName')?.value?.trim();

  if (!teamId) {
    showToast('Select a team first', 'warning');
    return;
  }
  if (!name) {
    showToast('Enter a team name', 'error');
    return;
  }

  const duplicate = teamsCache.find(t =>
    t.name.toLowerCase() === name.toLowerCase() && t.id !== teamId
  );
  if (duplicate) {
    showToast('A team with this name already exists', 'error');
    return;
  }

  const btn = e.target.querySelector('button[type="submit"]');
  const originalText = btn.textContent;
  btn.textContent = 'Saving…';
  btn.disabled = true;

  const genderScope = document.getElementById('teamRenameGenderScope')?.value || 'mixed';
  const teamType = document.getElementById('teamRenameType')?.value?.trim() || 'Department';
  const department = document.getElementById('teamRenameDepartment')?.value?.trim() || '';
  let prefix = document.getElementById('teamRenamePrefix')?.value?.trim()?.toUpperCase() || '';

  if (!prefix) {
    const cleaned = name.replace(/\s+/g, '');
    const base = cleaned.slice(0, Math.min(3, cleaned.length)).toUpperCase() || 'TSK';
    prefix = base;
    let counter = 1;
    while (teamsCache.some(t => t.prefix?.toUpperCase() === prefix && t.id !== teamId)) {
      prefix = base.slice(0, 2) + counter.toString();
      counter++;
    }
  } else {
    const prefixDuplicate = teamsCache.find(t => t.prefix?.toUpperCase() === prefix && t.id !== teamId);
    if (prefixDuplicate) {
      showToast('A team with this prefix already exists', 'error');
      btn.textContent = originalText;
      btn.disabled = false;
      return;
    }
  }

  try {
    const { error } = await supabaseClient
      .from('teams')
      .update({
        name,
        gender_scope: genderScope,
        team_type: teamType,
        department: department,
        prefix: prefix
      })
      .eq('id', teamId);
    if (error) throw error;

    const team = teamsCache.find(t => t.id === teamId);
    if (team) {
      team.name = name;
      team.gender_scope = genderScope;
      team.team_type = teamType;
      team.department = department;
    }

    showToast('Team settings updated', 'success');
    await loadManageableTeams();
    const select = document.getElementById('teamsPageSelect');
    if (select) select.value = teamId;
    await onTeamsPageSelectChange();
    await refreshAccessibleTeams();
  } catch (err) {
    console.error('Rename team error:', err);
    showToast(err.message || 'Failed to rename team', 'error');
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

function populateAddMemberUserSelect(teamId) {
  const select = document.getElementById('memberUserId');
  if (!select) return;

  const assignedIds = new Set(membersCache.map(m => m.user_id));
  const available = usersCache.filter(u => !assignedIds.has(u.id));
  const q = (document.getElementById('memberSearchInput')?.value || '').trim().toLowerCase();

  const matched = available.filter(u => 
    !q || 
    (u.name || '').toLowerCase().includes(q) || 
    (u.email || '').toLowerCase().includes(q)
  );

  select.innerHTML = '<option value="">Select user…</option>';
  matched.forEach(user => {
    select.innerHTML += `<option value="${user.id}">${escapeHtml(userLabel(user))}</option>`;
  });
}

async function loadTeamMembers(teamId) {
  const tbody = document.getElementById('teamMembersBody');
  const mobile = document.getElementById('teamMembersMobile');
  if (!tbody) return;
  const colCount = isOrgAdmin() ? 4 : 3;
  tbody.innerHTML = `<tr><td colspan="${colCount}" class="empty-state">Loading…</td></tr>`;

  try {
    const { data, error } = await supabaseClient
      .from('user_teams')
      .select('id, user_id, team_id, access_level, is_primary, users:user_id(id, name, email)')
      .eq('team_id', teamId)
      .order('access_level');

    if (error) throw error;

    membersCache = (data || []).map(row => ({
      ...row,
      user: row.users || usersCache.find(u => u.id === row.user_id)
    }));

    if (!membersCache.length) {
      const empty = `<tr><td colspan="${colCount}" class="empty-state">No members yet. Add a user above.</td></tr>`;
      tbody.innerHTML = empty;
      if (mobile) mobile.innerHTML = '<p class="empty-state">No members yet. Add a user above.</p>';
      return;
    }

    let mobileHtml = '';
    const activeTeam = teamsCache.find(t => t.id === teamId);
    tbody.innerHTML = membersCache.map(member => {
      const user = member.user;
      const isSelf = member.user_id === state.user?.id;
      const accessSelect = `<select class="team-access-select" onchange="window.updateMemberAccess('${member.id}', this.value)" ${isSelf && !isOrgAdmin() ? 'disabled' : ''}>${memberAccessOptions(member.access_level || 'member', activeTeam)}</select>`;
      const primaryBadge = isOrgAdmin()
        ? (member.is_primary
          ? '<span class="badge badge-success">★ Default</span>'
          : `<button type="button" class="secondary small" onclick="window.setMemberPrimary('${member.id}')">Set default</button>`)
        : '';
      const removeBtn = (isSelf && !isOrgAdmin())
        ? '<span class="badge badge-info">You</span>'
        : `<button type="button" class="danger small" onclick="window.removeTeamMember('${member.id}')">Remove</button>`;

      mobileHtml += `
        <article class="data-card data-card--compact">
          <div class="data-card-top">
            <span class="data-card-title">${escapeHtml(user?.name || '—')}</span>
            ${isSelf ? '<span class="badge badge-info">You</span>' : ''}
          </div>
          ${cardRow('Email', escapeHtml(user?.email || '—'))}
          <div class="data-card-row">
            <span class="data-card-row-label">Access</span>
            <span class="data-card-row-value">${accessSelect}</span>
          </div>
          ${isOrgAdmin() ? `<div class="data-card-row"><span class="data-card-row-label">Default</span><span class="data-card-row-value">${primaryBadge}</span></div>` : ''}
          ${!(isSelf && !isOrgAdmin()) ? `<div class="data-card-actions">${removeBtn}</div>` : ''}
        </article>
      `;

      return `
        <tr>
          <td data-label="User">
            <strong>${escapeHtml(user?.name || '—')}</strong><br>
            <span style="font-size:0.85em;color:var(--text-secondary);">${escapeHtml(user?.email || '')}</span>
          </td>
          <td data-label="Access">${accessSelect}</td>
          ${isOrgAdmin() ? `<td data-label="Default">${primaryBadge}</td>` : ''}
          <td data-label="Actions" class="action-buttons">${removeBtn}</td>
        </tr>
      `;
    }).join('');
    if (mobile) mobile.innerHTML = mobileHtml;
    window.filterTeamMembers();
  } catch (err) {
    console.error('Load members error:', err);
    tbody.innerHTML = `<tr><td colspan="${colCount}" class="empty-state" style="color:#dc3545;">${escapeHtml(err.message)}</td></tr>`;
    if (mobile) mobile.innerHTML = `<p class="empty-state" style="color:#dc3545;">${escapeHtml(err.message)}</p>`;
  }
}

function filterTeamMembers() {
  if (activeTeamId) {
    populateAddMemberUserSelect(activeTeamId);
  }
}

async function addTeamMember(e) {
  e.preventDefault();
  const teamId = document.getElementById('memberTeamId')?.value || activeTeamId;
  const userId = document.getElementById('memberUserId')?.value;
  const access_level = document.getElementById('memberAccessLevel')?.value || 'member';

  if (!teamId || !userId) {
    showToast('Select a user', 'error');
    return;
  }

  const btn = e.target.querySelector('button[type="submit"]');
  const originalText = btn.textContent;
  btn.textContent = 'Adding…';
  btn.disabled = true;

  try {
    const { error } = await supabaseClient.from('user_teams').insert({
      id: crypto.randomUUID(),
      user_id: userId,
      team_id: teamId,
      access_level,
      is_primary: false
    });

    if (error) {
      if (error.message?.includes('duplicate') || error.code === '23505') {
        showToast('User is already on this team', 'error');
        return;
      }
      if (error.message?.includes('user_teams_access_level_check') || error.code === '23514') {
        showToast('Invalid access level. Use Member, Team lead, or Operations head — not OPH/OPL codes directly.', 'error');
        return;
      }
      throw error;
    }

    const user = usersCache.find(u => u.id === userId);
    try {
      const pt = await ensurePersonalTeamForUser(userId, user?.name || user?.email, state.user?.id);
      if (pt.created) {
        console.log(`Personal team "${pt.team.name}" created`);
      }
    } catch (ptErr) {
      console.warn('Personal team setup:', ptErr);
      showToast('Member added; personal team setup failed — run migration 014', 'warning');
    }

    try {
      const mb = await ensureMemberBucketOnWorkTeam(
        teamId,
        userId,
        user?.name || user?.email,
        state.user?.id
      );
      if (mb.created) {
        console.log(`Member bucket "${mb.bucket.name}" created on this team`);
      }
    } catch (mbErr) {
      console.warn('Member bucket setup:', mbErr);
      showToast('Member added; work-team wallet setup failed', 'warning');
    }

    showToast('Member added', 'success');
    document.getElementById('addMemberForm')?.reset();
    document.getElementById('memberTeamId').value = teamId;
    document.getElementById('memberAccessLevel').value = access_level;

    await loadTeamMembers(teamId);
    populateAddMemberUserSelect(teamId);

    if (userId === state.user.id) {
      await refreshAccessibleTeams();
    }
  } catch (err) {
    console.error('Add member error:', err);
    showToast(err.message || 'Failed to add member', 'error');
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

async function updateMemberAccess(membershipId, accessLevel) {
  try {
    const { error } = await supabaseClient
      .from('user_teams')
      .update({ access_level: accessLevel })
      .eq('id', membershipId);

    if (error) throw error;
    showToast('Access updated', 'success');

    const member = membersCache.find(m => m.id === membershipId);
    if (member) member.access_level = accessLevel;

    if (member?.user_id === state.user.id && member.team_id === state.currentTeam?.team_id) {
      await refreshAccessibleTeams();
    }
  } catch (err) {
    console.error('Update access error:', err);
    showToast(err.message || 'Failed to update access', 'error');
    if (activeTeamId) await loadTeamMembers(activeTeamId);
  }
}

async function setMemberPrimary(membershipId) {
  const member = membersCache.find(m => m.id === membershipId);
  if (!member) return;

  try {
    await supabaseClient
      .from('user_teams')
      .update({ is_primary: false })
      .eq('user_id', member.user_id);

    const { error } = await supabaseClient
      .from('user_teams')
      .update({ is_primary: true })
      .eq('id', membershipId);

    if (error) throw error;
    showToast('Default team updated for user', 'success');

    if (member.user_id === state.user.id) {
      await refreshAccessibleTeams();
    }

    if (activeTeamId) await loadTeamMembers(activeTeamId);
  } catch (err) {
    console.error('Set primary error:', err);
    showToast(err.message || 'Failed to set default team', 'error');
  }
}

function removeTeamMember(membershipId) {
  const member = membersCache.find(m => m.id === membershipId);
  if (member?.user_id === state.user?.id && !isOrgAdmin()) {
    showToast('You cannot remove yourself from the team', 'error');
    return;
  }
  const label = userLabel(member?.user);

  showConfirm(`Remove ${label} from this team?`, async () => {
    try {
      if (activeTeamId && member?.user_id) {
        const nonZero = await findNonZeroBucketsOnTeam(activeTeamId, member.user_id);
        if (nonZero.length) {
          showToast(
            `Cannot remove: member has non-zero balance — ${formatNonZeroBucketList(nonZero)}`,
            'error'
          );
          return;
        }
      }

      const { error } = await supabaseClient
        .from('user_teams')
        .delete()
        .eq('id', membershipId);

      if (error) throw error;
      showToast('Member removed', 'success');

      if (activeTeamId) {
        await loadTeamMembers(activeTeamId);
        populateAddMemberUserSelect(activeTeamId);
      }

      if (member?.user_id === state.user.id) {
        await refreshAccessibleTeams();
      }
    } catch (err) {
      console.error('Remove member error:', err);
      showToast(err.message || 'Failed to remove member', 'error');
    }
  });
}

async function createOhtTeam(e) {
  e.preventDefault();
  if (!state.canCreateOhtTeam) return;

  const name = document.getElementById('ohtNewTeamName')?.value?.trim();
  if (!name) {
    showToast('Enter a team name', 'error');
    return;
  }

  const btn = e.target.querySelector('button[type="submit"]');
  const original = btn?.textContent;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Creating…';
  }

  try {
    const teamId = crypto.randomUUID();
    const genderScope = document.getElementById('ohtNewTeamGenderScope')?.value || 'mixed';
    const teamType = document.getElementById('ohtNewTeamType')?.value?.trim() || 'Department';
    const department = document.getElementById('ohtNewTeamDepartment')?.value?.trim() || '';
    let prefix = document.getElementById('ohtNewTeamPrefix')?.value?.trim()?.toUpperCase() || '';

    if (!prefix) {
      const cleaned = name.replace(/\s+/g, '');
      const base = cleaned.slice(0, Math.min(3, cleaned.length)).toUpperCase() || 'TSK';
      prefix = base;
      let counter = 1;
      while (teamsCache.some(t => t.prefix?.toUpperCase() === prefix)) {
        prefix = base.slice(0, 2) + counter.toString();
        counter++;
      }
    } else {
      const prefixDuplicate = teamsCache.find(t => t.prefix?.toUpperCase() === prefix);
      if (prefixDuplicate) {
        showToast('A team with this prefix already exists', 'error');
        if (btn) {
          btn.disabled = false;
          btn.textContent = original;
        }
        return;
      }
    }
    
    const { error: teamError } = await supabaseClient.from('teams').insert({
      id: teamId,
      name,
      is_personal_team: false,
      created_by_oht_user_id: state.user.id,
      gender_scope: genderScope,
      team_type: teamType,
      department: department,
      prefix: prefix
    });
    if (teamError) throw teamError;

    const { error: memError } = await supabaseClient.from('user_teams').insert({
      id: crypto.randomUUID(),
      user_id: state.user.id,
      team_id: teamId,
      access_level: 'oht',
      is_primary: false
    });
    if (memError) throw memError;

    showToast(`Team "${name}" created`, 'success');
    document.getElementById('ohtCreateTeamForm')?.reset();
    await refreshAccessibleTeams();
    activeTeamId = teamId;
    await loadManageableTeams();
    const select = document.getElementById('teamsPageSelect');
    if (select) {
      select.value = teamId;
      await onTeamsPageSelectChange();
    }
    toggleTeamsCreateCard(false);
  } catch (err) {
    console.error('Create OHT team:', err);
    showToast(err.message || 'Failed to create team. Run migration 016.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = original || 'Create Team';
    }
  }
}

async function deleteTeam() {
  const teamId = activeTeamId || document.getElementById('teamsPageSelect')?.value;
  if (!teamId) {
    showToast('Select a team first', 'warning');
    return;
  }
  
  const team = teamsCache.find(t => t.id === teamId);
  if (!team) return;
  
  showConfirm(`Are you sure you want to delete the team "${team.name}"? This cannot be undone and will delete all member assignments.`, async () => {
    try {
      // 1. Delete user_teams association
      const { error: utError } = await supabaseClient
        .from('user_teams')
        .delete()
        .eq('team_id', teamId);
      if (utError) throw utError;

      // 2. Delete request_role_assignments association
      await supabaseClient
        .from('request_role_assignments')
        .delete()
        .eq('team_id', teamId);

      // 3. Delete the team itself
      const { error: teamError } = await supabaseClient
        .from('teams')
        .delete()
        .eq('id', teamId);
      if (teamError) throw teamError;

      showToast(`Team "${team.name}" deleted successfully`, 'success');
      
      // Reset state and reload list
      activeTeamId = null;
      const select = document.getElementById('teamsPageSelect');
      if (select) select.value = '';
      await loadManageableTeams();
      await onTeamsPageSelectChange();
      await refreshAccessibleTeams();
    } catch (err) {
      console.error('Delete team error:', err);
      showToast(err.message || 'Failed to delete team', 'error');
    }
  });
}

function populateRelationshipChecklist(activeId) {
  const checklist = document.getElementById('relTeamsChecklist');
  if (!checklist) return;

  const searchInput = document.getElementById('relTeamSearch');
  if (searchInput) searchInput.value = '';

  const selectAllCheckbox = document.getElementById('relSelectAllTeams');
  if (selectAllCheckbox) selectAllCheckbox.checked = false;

  const otherTeams = teamsCache.filter(t => t.id !== activeId);

  checklist.innerHTML = otherTeams.length
    ? otherTeams.map(t => `
        <label class="rel-team-checkbox-row" data-team-name="${escapeAttr(t.name.toLowerCase())}" style="display:flex; align-items:center; gap:8px; cursor:pointer; padding:2px 0; font-size:0.9em;">
          <input type="checkbox" class="rel-team-checkbox" value="${t.id}">
          <span>${escapeHtml(t.name)}</span>
        </label>
      `).join('')
    : '<p class="empty-state" style="margin:0; font-size:0.85em;">No other teams available</p>';
}

function filterRelTeamsList() {
  const q = (document.getElementById('relTeamSearch')?.value || '').trim().toLowerCase();
  const rows = document.querySelectorAll('.rel-team-checkbox-row');
  rows.forEach(row => {
    const match = !q || row.dataset.teamName.includes(q);
    row.style.display = match ? 'flex' : 'none';
    if (!match) {
      const checkbox = row.querySelector('.rel-team-checkbox');
      if (checkbox) checkbox.checked = false;
    }
  });
}

function toggleAllRelTeams(checked) {
  const checkboxes = document.querySelectorAll('.rel-team-checkbox');
  checkboxes.forEach(cb => {
    const parentLabel = cb.closest('.rel-team-checkbox-row');
    if (parentLabel && parentLabel.style.display !== 'none') {
      cb.checked = checked;
    }
  });
}

async function loadTeamRelationships(teamId) {
  const parentList = document.getElementById('parentTeamsList');
  const childList = document.getElementById('childTeamsList');
  if (!parentList || !childList) return;

  parentList.innerHTML = '<li class="empty-state">Loading…</li>';
  childList.innerHTML = '<li class="empty-state">Loading…</li>';

  try {
    const { data: parentsData, error: parentsErr } = await supabaseClient
      .from('team_relationships')
      .select('parent_id')
      .eq('child_id', teamId);
    if (parentsErr) throw parentsErr;

    const { data: childrenData, error: childrenErr } = await supabaseClient
      .from('team_relationships')
      .select('child_id')
      .eq('parent_id', teamId);
    if (childrenErr) throw childrenErr;

    const parents = (parentsData || []).map(r => teamsCache.find(t => t.id === r.parent_id)).filter(Boolean);
    parentList.innerHTML = parents.length
      ? parents.map(p => `
          <li style="display:flex; justify-content:space-between; align-items:center; padding:4px 0; border-bottom:1px solid var(--border-light); font-size:0.9em;">
            <span><strong>${escapeHtml(p.name)}</strong> (${escapeHtml(p.team_type || 'Team')})</span>
            <button type="button" class="danger small" style="padding:2px 6px; font-size:0.8em; line-height:1;" onclick="window.removeTeamRelationship('${p.id}', '${teamId}')">Remove</button>
          </li>
        `).join('')
      : '<li class="empty-state">No parent teams</li>';

    const children = (childrenData || []).map(r => teamsCache.find(t => t.id === r.child_id)).filter(Boolean);
    childList.innerHTML = children.length
      ? children.map(c => `
          <li style="display:flex; justify-content:space-between; align-items:center; padding:4px 0; border-bottom:1px solid var(--border-light); font-size:0.9em;">
            <span><strong>${escapeHtml(c.name)}</strong> (${escapeHtml(c.team_type || 'Team')})</span>
            <button type="button" class="danger small" style="padding:2px 6px; font-size:0.8em; line-height:1;" onclick="window.removeTeamRelationship('${teamId}', '${c.id}')">Remove</button>
          </li>
        `).join('')
      : '<li class="empty-state">No sub-teams</li>';

  } catch (err) {
    console.error('Load team relationships error:', err);
    parentList.innerHTML = `<li class="empty-state error">Error: ${escapeHtml(err.message)}</li>`;
    childList.innerHTML = `<li class="empty-state error">Error: ${escapeHtml(err.message)}</li>`;
  }
}

async function addTeamRelationship() {
  const teamId = activeTeamId || document.getElementById('teamsPageSelect')?.value;
  const relType = document.getElementById('relTypeSelect')?.value;

  const checkedBoxes = [...document.querySelectorAll('.rel-team-checkbox:checked')];
  if (!teamId || !relType || checkedBoxes.length === 0) {
    showToast('Select at least one team and relationship type', 'warning');
    return;
  }

  const insertRows = checkedBoxes.map(cb => {
    const targetId = cb.value;
    const parentId = relType === 'child' ? teamId : targetId;
    const childId = relType === 'child' ? targetId : teamId;
    return { parent_id: parentId, child_id: childId };
  });

  try {
    const { error } = await supabaseClient
      .from('team_relationships')
      .insert(insertRows);
    if (error) {
      if (error.code === '23505') {
        showToast('One or more of these relationships already exist', 'warning');
      } else {
        throw error;
      }
    } else {
      showToast('Relationships added successfully', 'success');
      checkedBoxes.forEach(cb => { cb.checked = false; });
      const selectAllCheckbox = document.getElementById('relSelectAllTeams');
      if (selectAllCheckbox) selectAllCheckbox.checked = false;
      
      await loadTeamRelationships(teamId);
    }
  } catch (err) {
    console.error('Add team relationships error:', err);
    showToast(err.message || 'Failed to add relationships', 'error');
  }
}

async function removeTeamRelationship(parentId, childId) {
  const teamId = activeTeamId || document.getElementById('teamsPageSelect')?.value;
  showConfirm('Are you sure you want to remove this relationship?', async () => {
    try {
      const { error } = await supabaseClient
        .from('team_relationships')
        .delete()
        .eq('parent_id', parentId)
        .eq('child_id', childId);
      if (error) throw error;
      showToast('Relationship removed', 'success');
      await loadTeamRelationships(teamId);
    } catch (err) {
      console.error('Remove team relationship error:', err);
      showToast(err.message || 'Failed to remove relationship', 'error');
    }
  });
}
