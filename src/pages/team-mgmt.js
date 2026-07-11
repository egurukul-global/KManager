// ==================== TEAM MANAGEMENT (ADMIN) ====================
import { state } from '../state.js';
import { supabaseClient } from '../db.js';
import { showToast, showConfirm } from '../components/toasts.js';
import { btnIconEdit } from '../utils/uiHelpers.js';
import { refreshAccessibleTeams } from '../utils/teamAccess.js';
import { ensurePersonalTeamForUser } from '../utils/personalTeamHelpers.js';
import { ensureMemberBucketOnWorkTeam } from '../utils/memberBucketHelpers.js';
import { findNonZeroBucketsOnTeam, formatNonZeroBucketList } from '../utils/balanceGuards.js';

const ACCESS_LEVELS = [
  { value: 'view', label: 'View (read-only)' },
  { value: 'member', label: 'Member (OTM)' },
  { value: 'oht', label: 'Ops Head (OHT, read-only)' },
  { value: 'lead', label: 'Lead (OTL)' },
  { value: 'admin', label: 'Admin' }
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

export function getTeamMgmtPage() {
  if (!isOrgAdmin()) {
    return `
      <h1 class="page-title">Teams</h1>
      <div class="card"><h2>⛔ Access Denied</h2><p>Only org admins can manage teams.</p></div>
    `;
  }

  return `
    <h1 class="page-title">Teams</h1>
    <p class="page-intro">Create and rename teams, then assign members with access levels. Users see assigned teams in the sidebar team switcher.</p>

    <div class="card">
      <h2>➕ Add / Edit Team</h2>
      <form id="teamForm" onsubmit="window.saveTeam(event)">
        <input type="hidden" id="teamEditId">
        <div class="form-stack">
          <div class="form-grid-row form-grid-row--team-meta">
            <div class="form-group">
              <label>Team Name *</label>
              <input type="text" id="teamName" required placeholder="e.g. Mumbai Outreach" maxlength="120">
            </div>
          </div>
        </div>
        <div class="btn-group">
          <button type="submit">Save Team</button>
          <button type="button" class="secondary" onclick="window.resetTeamForm()">Clear</button>
        </div>
      </form>
    </div>

    <div class="card">
      <h2>🏢 All Teams</h2>
      <div class="table-container">
        <table class="table-stack-mobile team-mgmt-table">
          <thead>
            <tr>
              <th>Team</th>
              <th>Members</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="teamsListBody">
            <tr><td colspan="3" class="empty-state">Loading…</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="card team-members-panel" id="teamMembersPanel" style="display:none;">
      <div class="team-members-panel__header">
        <h2 id="teamMembersTitle">Team Members</h2>
        <button type="button" class="secondary small" onclick="window.closeTeamMembersPanel()">Close</button>
      </div>

      <form id="addMemberForm" class="team-add-member-form" onsubmit="window.addTeamMember(event)">
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
              ${accessLevelOptions('member')}
            </select>
          </div>
          <div class="form-group team-add-member-form__actions">
            <label>&nbsp;</label>
            <button type="submit">Add Member</button>
          </div>
        </div>
      </form>

      <div class="table-container">
        <table class="table-stack-mobile team-mgmt-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Access</th>
              <th>Default</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="teamMembersBody">
            <tr><td colspan="4" class="empty-state">Select a team to manage members.</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

export async function initTeamMgmtPage() {
  if (!isOrgAdmin()) return;

  window.saveTeam = saveTeam;
  window.resetTeamForm = resetTeamForm;
  window.editTeam = editTeam;
  window.openTeamMembers = openTeamMembers;
  window.closeTeamMembersPanel = closeTeamMembersPanel;
  window.addTeamMember = addTeamMember;
  window.updateMemberAccess = updateMemberAccess;
  window.setMemberPrimary = setMemberPrimary;
  window.removeTeamMember = removeTeamMember;

  await Promise.all([loadUsersCache(), loadTeams()]);
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

async function loadTeams() {
  const tbody = document.getElementById('teamsListBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="3" class="empty-state">Loading…</td></tr>';

  try {
    const { data: teams, error: teamsError } = await supabaseClient
      .from('teams')
      .select('id, name')
      .order('name');

    if (teamsError) throw teamsError;

    const { data: memberships, error: memError } = await supabaseClient
      .from('user_teams')
      .select('id, team_id, user_id');

    if (memError) throw memError;

    const memberCounts = {};
    (memberships || []).forEach(m => {
      memberCounts[m.team_id] = (memberCounts[m.team_id] || 0) + 1;
    });

    teamsCache = (teams || []).map(t => ({
      ...t,
      member_count: memberCounts[t.id] || 0
    }));

    if (!teamsCache.length) {
      tbody.innerHTML = '<tr><td colspan="3" class="empty-state">No teams yet. Add one above.</td></tr>';
      return;
    }

    tbody.innerHTML = teamsCache.map(team => `
      <tr>
        <td data-label="Team"><strong>${escapeHtml(team.name)}</strong></td>
        <td data-label="Members">${team.member_count}</td>
        <td data-label="Actions" class="action-buttons team-mgmt-actions">
          ${btnIconEdit(`window.editTeam('${team.id}')`)}
          <button type="button" class="secondary small" onclick="window.openTeamMembers('${team.id}')">Members</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Load teams error:', err);
    tbody.innerHTML = `<tr><td colspan="3" class="empty-state" style="color:#dc3545;">${escapeHtml(err.message)}. Run migration 011 if policies are missing.</td></tr>`;
  }
}

function resetTeamForm() {
  document.getElementById('teamEditId').value = '';
  document.getElementById('teamForm')?.reset();
}

function editTeam(id) {
  const team = teamsCache.find(t => t.id === id);
  if (!team) return;
  document.getElementById('teamEditId').value = team.id;
  document.getElementById('teamName').value = team.name || '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
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
    }

    resetTeamForm();
    await loadTeams();
    await refreshAccessibleTeams();
  } catch (err) {
    console.error('Save team error:', err);
    showToast(err.message || 'Failed to save team', 'error');
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

function closeTeamMembersPanel() {
  const panel = document.getElementById('teamMembersPanel');
  if (panel) panel.style.display = 'none';
  activeTeamId = null;
  membersCache = [];
}

async function openTeamMembers(teamId) {
  const team = teamsCache.find(t => t.id === teamId);
  if (!team) return;

  activeTeamId = teamId;
  const panel = document.getElementById('teamMembersPanel');
  const title = document.getElementById('teamMembersTitle');
  const teamIdInput = document.getElementById('memberTeamId');

  if (title) title.textContent = `Members — ${team.name}`;
  if (teamIdInput) teamIdInput.value = teamId;
  if (panel) panel.style.display = '';

  await loadTeamMembers(teamId);
  populateAddMemberUserSelect(teamId);
  await backfillMemberBucketsForTeam(teamId);
  panel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Loading…</td></tr>';

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
      tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No members yet. Add a user above.</td></tr>';
      return;
    }

    tbody.innerHTML = membersCache.map(member => {
      const user = member.user;
      const primaryBadge = member.is_primary
        ? '<span class="badge badge-success">★ Default</span>'
        : `<button type="button" class="secondary small" onclick="window.setMemberPrimary('${member.id}')">Set default</button>`;

      return `
        <tr>
          <td data-label="User">
            <strong>${escapeHtml(user?.name || '—')}</strong><br>
            <span style="font-size:0.85em;color:var(--text-secondary);">${escapeHtml(user?.email || '')}</span>
          </td>
          <td data-label="Access">
            <select class="team-access-select" onchange="window.updateMemberAccess('${member.id}', this.value)">
              ${accessLevelOptions(member.access_level || 'member')}
            </select>
          </td>
          <td data-label="Default">${primaryBadge}</td>
          <td data-label="Actions" class="action-buttons">
            <button type="button" class="danger small" onclick="window.removeTeamMember('${member.id}')">Remove</button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Load members error:', err);
    tbody.innerHTML = `<tr><td colspan="4" class="empty-state" style="color:#dc3545;">${escapeHtml(err.message)}</td></tr>`;
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
    await loadTeams();

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
        await loadTeams();
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
