// ==================== TEAM MANAGEMENT (ADMIN) ====================
import { state } from '../state.js';
import { supabaseClient } from '../db.js';
import { showToast, showConfirm } from '../components/toasts.js';
import { cardRow } from '../utils/uiHelpers.js';
import { refreshAccessibleTeams } from '../utils/teamAccess.js';
import { ensurePersonalTeamForUser } from '../utils/personalTeamHelpers.js';
import { ensureMemberBucketOnWorkTeam } from '../utils/memberBucketHelpers.js';
import { findNonZeroBucketsOnTeam, formatNonZeroBucketList } from '../utils/balanceGuards.js';

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

function accessLevelOptions(selected = 'member') {
  return ACCESS_LEVELS.map(l => {
    const sel = l.value === selected ? ' selected' : '';
    return `<option value="${l.value}"${sel}>${l.label}</option>`;
  }).join('');
}

const OHT_ASSIGNABLE_LEVELS = [
  { value: 'view', label: 'View only' },
  { value: 'member', label: 'Member (OPS)' },
  { value: 'lead', label: 'Team lead (OPL)' },
  { value: 'oht', label: 'Operations head (OPH)' }
];

function ohtAccessLevelOptions(selected = 'member') {
  return OHT_ASSIGNABLE_LEVELS.map(l => {
    const sel = l.value === selected ? ' selected' : '';
    return `<option value="${l.value}"${sel}>${l.label}</option>`;
  }).join('');
}

function canAccessTeamsPage() {
  return isOrgAdmin() || !!state.canManageTeamRoster;
}

function canCreateTeamsOnPage() {
  return isOrgAdmin() || !!state.canCreateOhtTeam;
}

function memberAccessOptions(selected = 'member') {
  if (isOrgAdmin()) return accessLevelOptions(selected);
  return ohtAccessLevelOptions(selected);
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
          <input type="hidden" id="teamEditId">
          <div class="form-group">
            <label>Team Name *</label>
            <input type="text" id="teamName" required placeholder="e.g. Mumbai Outreach" maxlength="120">
          </div>
          <div class="btn-group">
            <button type="submit">Save Team</button>
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
          <div class="btn-group">
            <button type="submit">Create Team</button>
            <button type="button" class="secondary" onclick="window.toggleTeamsCreateCard(false)">Cancel</button>
          </div>
        </form>
      `}
    </div>
  ` : '';

  const renameBlock = isOrgAdmin() ? `
    <div class="card" id="teamsRenameCard" style="display:none;">
      <h2>✏️ Rename Team</h2>
      <form id="teamRenameForm" onsubmit="window.saveTeam(event)">
        <input type="hidden" id="teamEditId">
        <div class="form-group">
          <label>Team Name *</label>
          <input type="text" id="teamName" required maxlength="120">
        </div>
        <div class="btn-group">
          <button type="submit">Save</button>
          <button type="button" class="secondary" onclick="window.toggleTeamsRenameCard(false)">Cancel</button>
        </div>
      </form>
    </div>
  ` : '';

  return `
    <h1 class="page-title">Teams</h1>
    <p class="page-intro">Select a team to manage members. Create teams if your role allows.</p>

    <div class="card">
      <div class="form-grid-row form-grid-row--team-picker">
        <div class="form-group" style="flex:1;">
          <label>Team</label>
          <select id="teamsPageSelect" onchange="window.onTeamsPageSelectChange()">
            <option value="">Loading teams…</option>
          </select>
        </div>
        <div class="form-group team-picker-actions">
          <label>&nbsp;</label>
          <div class="btn-group">
            ${canCreateTeamsOnPage() ? '<button type="button" class="success" onclick="window.toggleTeamsCreateCard(true)">+ New team</button>' : ''}
            ${isOrgAdmin() ? '<button type="button" class="secondary" onclick="window.toggleTeamsRenameCard(true)">Rename</button>' : ''}
          </div>
        </div>
      </div>
    </div>

    ${createBlock}
    ${renameBlock}

    <div class="card team-members-panel" id="teamMembersPanel">
      <h2 id="teamMembersTitle">Members</h2>
      <p id="teamsMembersHint" class="page-intro">Select a team above. Team access (OPS/OPL/OPH) is set here. Approval roles FIN, FIH, CAO are assigned separately under Admin → Role Assignments or on the user account.</p>

      <form id="addMemberForm" class="team-add-member-form" onsubmit="window.addTeamMember(event)" style="display:none;">
        <input type="hidden" id="memberTeamId">
        <div class="form-grid-row form-grid-row--team-member">
          <div class="form-group">
            <label>Add User *</label>
            <select id="memberUserId" required>
              <option value="">Select user…</option>
            </select>
          </div>
          <div class="form-group">
            <label>Access Level *</label>
            <select id="memberAccessLevel" required>
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
  `;
}

export async function initTeamMgmtPage() {
  if (!canAccessTeamsPage()) return;

  window.saveTeam = saveTeam;
  window.resetTeamForm = resetTeamForm;
  window.addTeamMember = addTeamMember;
  window.updateMemberAccess = updateMemberAccess;
  window.setMemberPrimary = setMemberPrimary;
  window.removeTeamMember = removeTeamMember;
  window.onTeamsPageSelectChange = onTeamsPageSelectChange;
  window.toggleTeamsCreateCard = toggleTeamsCreateCard;
  window.toggleTeamsRenameCard = toggleTeamsRenameCard;
  window.createOhtTeam = createOhtTeam;

  await loadUsersCache();
  await loadManageableTeams();
}

async function loadManageableTeams() {
  const select = document.getElementById('teamsPageSelect');
  if (!select) return;

  try {
    if (isOrgAdmin()) {
      const { data: teams, error } = await supabaseClient
        .from('teams')
        .select('id, name, is_personal_team')
        .eq('is_personal_team', false)
        .order('name');
      if (error) throw error;
      teamsCache = (teams || []).map(t => ({ id: t.id, name: t.name, member_count: 0 }));
    } else {
      teamsCache = (state.teams || [])
        .filter(t => String(t.access_level || '').toLowerCase() === 'oht')
        .map(t => ({ id: t.team_id, name: t.team_name, member_count: 0 }));
    }

    select.innerHTML = teamsCache.length
      ? '<option value="">Select a team…</option>'
      : '<option value="">No teams available</option>';

    teamsCache.forEach(team => {
      select.innerHTML += `<option value="${team.id}">${escapeHtml(team.name)}</option>`;
    });

    const preferred = activeTeamId || state.currentTeam?.team_id;
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

  if (!teamId) {
    activeTeamId = null;
    membersCache = [];
    if (form) form.style.display = 'none';
    if (hint) hint.style.display = '';
    if (title) title.textContent = 'Members';
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
  document.getElementById('memberTeamId').value = teamId;

  await loadTeamMembers(teamId);
  populateAddMemberUserSelect(teamId);
  await backfillMemberBucketsForTeam(teamId);
}

function toggleTeamsCreateCard(show) {
  const card = document.getElementById('teamsCreateCard');
  if (card) card.style.display = show ? '' : 'none';
  if (show) toggleTeamsRenameCard(false);
}

function toggleTeamsRenameCard(show) {
  const card = document.getElementById('teamsRenameCard');
  if (!card) return;
  card.style.display = show ? '' : 'none';
  if (show) {
    toggleTeamsCreateCard(false);
    const teamId = document.getElementById('teamsPageSelect')?.value;
    const team = teamsCache.find(t => t.id === teamId);
    if (!team) {
      showToast('Select a team first', 'warning');
      card.style.display = 'none';
      return;
    }
    document.getElementById('teamEditId').value = team.id;
    document.getElementById('teamName').value = team.name || '';
  }
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
  const editId = document.getElementById('teamEditId');
  if (editId) editId.value = '';
  document.getElementById('teamForm')?.reset();
  document.getElementById('teamRenameForm')?.reset();
}

async function saveTeam(e) {
  e.preventDefault();
  const id = document.getElementById('teamEditId').value;
  const name = document.getElementById('teamName').value.trim();

  if (!name) {
    showToast('Enter a team name', 'error');
    return;
  }

  const duplicate = teamsCache.find(t =>
    t.name.toLowerCase() === name.toLowerCase() && t.id !== id
  );
  if (duplicate) {
    showToast('A team with this name already exists', 'error');
    return;
  }

  const btn = e.target.querySelector('button[type="submit"]');
  const originalText = btn.textContent;
  btn.textContent = 'Saving…';
  btn.disabled = true;

  try {
    if (id) {
      const { error } = await supabaseClient
        .from('teams')
        .update({ name })
        .eq('id', id);
      if (error) throw error;
      showToast('Team updated', 'success');
    } else {
      const newId = crypto.randomUUID();
      const { error } = await supabaseClient.from('teams').insert({ id: newId, name });
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
    }

    resetTeamForm();
    toggleTeamsCreateCard(false);
    toggleTeamsRenameCard(false);
    const savedId = id || activeTeamId;
    await loadManageableTeams();
    if (savedId) {
      const select = document.getElementById('teamsPageSelect');
      if (select) select.value = savedId;
      await onTeamsPageSelectChange();
    }
    await refreshAccessibleTeams();
  } catch (err) {
    console.error('Save team error:', err);
    showToast(err.message || 'Failed to save team', 'error');
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

  select.innerHTML = '<option value="">Select user…</option>';
  available.forEach(user => {
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
    tbody.innerHTML = membersCache.map(member => {
      const user = member.user;
      const isSelf = member.user_id === state.user?.id;
      const accessSelect = `<select class="team-access-select" onchange="window.updateMemberAccess('${member.id}', this.value)" ${isSelf && !isOrgAdmin() ? 'disabled' : ''}>${memberAccessOptions(member.access_level || 'member')}</select>`;
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
  } catch (err) {
    console.error('Load members error:', err);
    tbody.innerHTML = `<tr><td colspan="${colCount}" class="empty-state" style="color:#dc3545;">${escapeHtml(err.message)}</td></tr>`;
    if (mobile) mobile.innerHTML = `<p class="empty-state" style="color:#dc3545;">${escapeHtml(err.message)}</p>`;
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
        showToast(`Personal team "${pt.team.name}" created`, 'success');
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
        showToast(`Member bucket "${mb.bucket.name}" created on this team`, 'success');
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
    const { error: teamError } = await supabaseClient.from('teams').insert({
      id: teamId,
      name,
      is_personal_team: false,
      created_by_oht_user_id: state.user.id
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
