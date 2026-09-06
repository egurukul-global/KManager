// ==================== USER MANAGEMENT (Phase 4C Lite) ====================
import { state } from '../state.js';
import { supabaseClient } from '../db.js';
import { showToast, showConfirm } from '../components/toasts.js';
import { renderAppRoleManager } from '../components/AppRoleManager.js';
import { isFinanceGlobalAdmin } from '../utils/appRoles.js';
import { createModal, openModal, closeModal, removeModal } from '../components/modals.js';
import { cardRow, setButtonLoading } from '../utils/uiHelpers.js';
import {
  canManageUsers,
  assignableOrgRoles,
  orgRoleLabel
} from '../utils/userMgmtAccess.js';
import { ensureMemberBucketOnWorkTeam } from '../utils/memberBucketHelpers.js';
import { navigateToTeamMgmt } from '../utils/teamMgmtNavigation.js';

const USER_SELECT_MODAL_ID = 'userSelectModal';

const ORG_ROLE_FILTERS = [
  { value: 'user', label: 'User' },
  { value: 'fin', label: 'Finance reviewer (FIN)' },
  { value: 'fip', label: 'Finance payments (FIP)' },
  { value: 'oh', label: 'Finance head (FIH)' },
  { value: 'caoh', label: 'Chief admin (CAO)' },
  { value: 'ceo', label: 'CEO' },
  { value: 'admin', label: 'System admin (SYS)' }
];

const TEAM_ACCESS_DISPLAY = {
  view: 'View only',
  member: 'Member (OPS)',
  lead: 'Team lead (OPL)',
  oht: 'Operations head (OPH)',
  admin: 'Team admin'
};

let allUsersData = [];
let teamCountMapCache = {};
let teamsCache = [];
let editingUserId = null;
let editOnHoldValue = false;

const ACCESS_LEVELS = [
  { value: 'member', label: 'Member (OPS)' },
  { value: 'lead', label: 'Team lead (OPL)' },
  { value: 'oht', label: 'Operations head (OPH)' },
  { value: 'view', label: 'View only' }
];

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function orgRoleFilterOptions() {
  let html = '<option value="">All org roles</option>';
  ORG_ROLE_FILTERS.forEach(r => {
    html += `<option value="${r.value}">${r.label}</option>`;
  });
  return html;
}

function roleOptions(selected = 'user') {
  const current = String(selected || 'user').toLowerCase().trim();
  const roles = assignableOrgRoles();
  if (current && !roles.includes(current)) roles.unshift(current);
  return roles.map(r => {
    const sel = r === current ? ' selected' : '';
    return `<option value="${r}"${sel}>${orgRoleLabel(r)}</option>`;
  }).join('');
}

function accessOptions(selected = 'member') {
  return ACCESS_LEVELS.map(l => {
    const sel = l.value === selected ? ' selected' : '';
    return `<option value="${l.value}"${sel}>${l.label}</option>`;
  }).join('');
}

function teamAccessDisplayLabel(accessLevel) {
  const key = String(accessLevel || 'member').toLowerCase().trim();
  return TEAM_ACCESS_DISPLAY[key] || key;
}

export function getUserMgmtPage() {
  if (!canManageUsers()) {
    return `
      <h1 class="page-title">Users</h1>
      <div class="card"><p class="empty-state">Only org administrators can manage users.</p></div>
    `;
  }

  return `
    <h1 class="page-title">Users</h1>
    <p class="page-intro">Finance department: set org roles, hold within Finance, and review team membership. New logins and app access are managed in <strong>One Kailasa Admin</strong>.</p>

    <div id="financeAppRoleManagerContainer"></div>
    <div class="card" style="margin-top: 30px;">
      <h2 style="margin-top:0; margin-bottom:15px;">Ops Team Membership (Legacy)</h2>
      <div class="form-grid-row form-grid-row--user-filters">
        <div class="form-group">
          <label>Search</label>
          <input type="text" id="userMgmtSearch" placeholder="Name or email" oninput="window.filterUserMgmtList()" onkeydown="if(event.key==='Enter'){event.preventDefault();window.filterUserMgmtList();}">
        </div>
        <div class="form-group">
          <label>Status</label>
          <select id="userMgmtStatusFilter" onchange="window.filterUserMgmtList()">
            <option value="active">Active</option>
            <option value="hold">On hold</option>
            <option value="all">All</option>
          </select>
        </div>
        <div class="form-group">
          <label>Org role</label>
          <select id="userMgmtRoleFilter" onchange="window.filterUserMgmtList()">
            ${orgRoleFilterOptions()}
          </select>
        </div>
        <div class="form-group user-mgmt-filter-actions">
          <label>&nbsp;</label>
          <div class="btn-group">
            <button type="button" onclick="window.filterUserMgmtList()">Search</button>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>All users</h2>
      <div class="table-container show-desktop">
        <table class="table-stack-mobile user-mgmt-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Org role</th>
              <th>Teams</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="userMgmtTableBody">
            <tr><td colspan="6" class="empty-state">Loadingâ€¦</td></tr>
          </tbody>
        </table>
      </div>
      <div id="userMgmtMobile" class="show-mobile data-card-list"></div>
    </div>
  `;
}

export async function initUserMgmtPage() {
  if (isFinanceGlobalAdmin()) {
    renderAppRoleManager('financeAppRoleManagerContainer', 'finance');
  }
  if (!canManageUsers()) return;

  window.loadUserMgmtList = loadUserMgmtList;
  window.filterUserMgmtList = filterUserMgmtList;
  window.toggleUserCreateCard = toggleUserCreateCard;
  window.createAppUser = createAppUser;
  window.openUserSelect = openUserSelect;
  window.closeUserSelectModal = closeUserSelectModal;
  window.saveUserProfile = saveUserProfile;
  window.sendUserPasswordReset = sendUserPasswordReset;
  window.confirmUserOnHoldToggle = confirmUserOnHoldToggle;
  window.openUserTeamFromModal = openUserTeamFromModal;
  window.openTeamsAdmin = openTeamsAdmin;
  window.openRoleAssignmentsAdmin = openRoleAssignmentsAdmin;

  await loadTeamsForForms();
  await loadUserMgmtList();
}

async function loadTeamsForForms() {
  const { data, error } = await supabaseClient
    .from('teams')
    .select('id, name')
    .eq('is_personal_team', false)
    .order('name');

  teamsCache = error ? [] : (data || []);

  const opts = '<option value="">None — assign later in Teams</option>'
    + teamsCache.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');

  const newTeam = document.getElementById('newUserTeam');
  if (newTeam) newTeam.innerHTML = opts;
}

function toggleUserCreateCard(show) {
  const card = document.getElementById('userCreateCard');
  if (card) card.style.display = show ? '' : 'none';
  if (show) closeUserSelectModal();
}

function wireUserSelectModal() {
  const modal = document.getElementById(USER_SELECT_MODAL_ID);
  if (!modal) return;
  const closeBtn = modal.querySelector('.close-modal');
  if (closeBtn) closeBtn.onclick = () => closeUserSelectModal();
  modal.onclick = (e) => {
    if (e.target === modal) closeUserSelectModal();
  };
}

function closeUserSelectModal() {
  editingUserId = null;
  editOnHoldValue = false;
  closeModal(USER_SELECT_MODAL_ID);
}

function openTeamsAdmin() {
  closeUserSelectModal();
  navigateToTeamMgmt(null);
}

function openRoleAssignmentsAdmin() {
  closeUserSelectModal();
  window.showPage('role-assignments');
}

function openUserTeamFromModal(teamId) {
  closeUserSelectModal();
  navigateToTeamMgmt(teamId);
}

function getFilteredUsers() {
  const search = (document.getElementById('userMgmtSearch')?.value || '').trim().toLowerCase();
  const statusFilter = document.getElementById('userMgmtStatusFilter')?.value || 'active';
  const roleFilter = (document.getElementById('userMgmtRoleFilter')?.value || '').toLowerCase();

  return allUsersData.filter(u => {
    if (statusFilter === 'active' && u.on_hold) return false;
    if (statusFilter === 'hold' && !u.on_hold) return false;
    if (roleFilter && String(u.role || 'user').toLowerCase() !== roleFilter) return false;
    if (!search) return true;
    const hay = `${u.name || ''} ${u.email || ''}`.toLowerCase();
    return hay.includes(search);
  });
}

function renderUserMgmtList(users) {
  const tbody = document.getElementById('userMgmtTableBody');
  const mobile = document.getElementById('userMgmtMobile');

  if (!users.length) {
    const empty = '<p class="empty-state">No users match these filters.</p>';
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No users match these filters.</td></tr>';
    if (mobile) mobile.innerHTML = empty;
    return;
  }

  let tableHtml = '';
  let mobileHtml = '';

  users.forEach(user => {
    const statusBadge = user.on_hold
      ? '<span class="badge badge-danger">On hold</span>'
      : '<span class="badge badge-success">Active</span>';
    const teams = teamCountMapCache[user.id] || 0;
    const teamsLabel = teams === 1 ? '1 work team' : `${teams} work teams`;

    tableHtml += `
      <tr>
        <td data-label="Name"><strong>${escapeHtml(user.name || '—')}</strong></td>
        <td data-label="Email">${escapeHtml(user.email || '—')}</td>
        <td data-label="Org role">${orgRoleLabel(user.role)}</td>
        <td data-label="Teams">${teamsLabel}</td>
        <td data-label="Status">${statusBadge}</td>
        <td data-label="Actions">
          <button type="button" class="small secondary" onclick="window.openUserSelect('${user.id}')">Select</button>
        </td>
      </tr>
    `;

    mobileHtml += `
      <article class="data-card data-card--compact">
        <div class="data-card-top">
          <span class="data-card-title">${escapeHtml(user.name || user.email)}</span>
          ${statusBadge}
        </div>
        ${cardRow('Email', user.email || '—')}
        ${cardRow('Org role', orgRoleLabel(user.role))}
        ${cardRow('Work teams', teamsLabel)}
        <div class="btn-group" style="margin-top:8px;">
          <button type="button" class="small secondary" onclick="window.openUserSelect('${user.id}')">Select</button>
        </div>
      </article>
    `;
  });

  if (tbody) tbody.innerHTML = tableHtml;
  if (mobile) mobile.innerHTML = mobileHtml;
}

function filterUserMgmtList() {
  renderUserMgmtList(getFilteredUsers());
}

async function loadUserMgmtList() {
  const tbody = document.getElementById('userMgmtTableBody');
  const mobile = document.getElementById('userMgmtMobile');

  if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Loadingâ€¦</td></tr>';
  if (mobile) mobile.innerHTML = '<p class="empty-state">Loadingâ€¦</p>';

  try {
    const { data: users, error } = await supabaseClient
      .from('users')
      .select('id, email, name, role, on_hold, request_alias, gender, allowed_views')
      .order('name');

    if (error) throw error;

    const { data: memberships } = await supabaseClient
      .from('user_teams')
      .select('user_id, team_id, teams:team_id(name, is_personal_team)')
      .order('user_id');

    teamCountMapCache = {};
    (memberships || []).forEach(m => {
      if (m.teams?.is_personal_team) return;
      teamCountMapCache[m.user_id] = (teamCountMapCache[m.user_id] || 0) + 1;
    });

    allUsersData = users || [];
    filterUserMgmtList();
  } catch (err) {
    console.error('Load users:', err);
    const msg = escapeHtml(err.message);
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="empty-state" style="color:#dc3545;">${msg}</td></tr>`;
    if (mobile) mobile.innerHTML = `<p class="empty-state" style="color:#dc3545;">${msg}</p>`;
  }
}

function buildWorkTeamsSection(workTeams) {
  if (!workTeams.length) {
    return `
      <p class="empty-state">No work teams — assign under Admin → Teams.</p>
      <div class="section-link">
        <button type="button" class="secondary small" onclick="window.openTeamsAdmin()">Open Teams</button>
      </div>
    `;
  }

  const rows = workTeams.map(m => {
    const teamId = m.team_id;
    const teamName = escapeHtml(m.teams?.name || 'Team');
    const access = escapeHtml(teamAccessDisplayLabel(m.access_level));
    return `
      <tr>
        <td>
          <button type="button" class="user-team-link" onclick="window.openUserTeamFromModal('${teamId}')">${teamName}</button>
        </td>
        <td>${access}</td>
      </tr>
    `;
  }).join('');

  return `
    <table class="user-select-table show-desktop">
      <thead>
        <tr><th>Team</th><th>Access</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="show-mobile data-card-list">
      ${workTeams.map(m => `
        <article class="data-card data-card--compact">
          <div class="data-card-top">
            <button type="button" class="user-team-link data-card-title" onclick="window.openUserTeamFromModal('${m.team_id}')">${escapeHtml(m.teams?.name || 'Team')}</button>
          </div>
          ${cardRow('Access', teamAccessDisplayLabel(m.access_level))}
        </article>
      `).join('')}
    </div>
    <div class="section-link">
      <button type="button" class="secondary small" onclick="window.openTeamsAdmin()">Open Teams</button>
    </div>
  `;
}

function buildApprovalRolesSection(assignments) {
  if (!assignments.length) {
    return `
      <p class="empty-state">No approval role assignments — set under Admin → Role Assignments.</p>
      <div class="section-link">
        <button type="button" class="secondary small" onclick="window.openRoleAssignmentsAdmin()">Open Role Assignments</button>
      </div>
    `;
  }

  const rows = assignments.map(row => {
    const teamName = row.team_id
      ? escapeHtml(row.teams?.name || 'Team')
      : 'Global';
    const requestType = escapeHtml(row.request_type || 'All');
    return `
      <tr>
        <td><span class="badge badge-info">${escapeHtml(row.role_code)}</span></td>
        <td>${teamName}</td>
        <td>${requestType}</td>
      </tr>
    `;
  }).join('');

  return `
    <table class="user-select-table show-desktop">
      <thead>
        <tr><th>Role</th><th>Team</th><th>Request type</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="show-mobile data-card-list">
      ${assignments.map(row => `
        <article class="data-card data-card--compact">
          <div class="data-card-top">
            <span class="data-card-title">${escapeHtml(row.role_code)}</span>
            <span class="badge badge-info">${escapeHtml(row.request_type || 'All')}</span>
          </div>
          ${cardRow('Team', row.team_id ? (row.teams?.name || 'Team') : 'Global')}
        </article>
      `).join('')}
    </div>
    <div class="section-link">
      <button type="button" class="secondary small" onclick="window.openRoleAssignmentsAdmin()">Open Role Assignments</button>
    </div>
  `;
}

async function openUserSelect(userId) {
  const user = allUsersData.find(u => u.id === userId);
  if (!user) return;

  editingUserId = userId;
  toggleUserCreateCard(false);

  removeModal(USER_SELECT_MODAL_ID);
  createModal(USER_SELECT_MODAL_ID, '<p class="empty-state">Loading user details and membershipsâ€¦</p>', { maxWidth: '720px' });
  wireUserSelectModal();
  openModal(USER_SELECT_MODAL_ID);

  try {
    const [
      { data: memberships, error: memError }, 
      { data: assignments, error: assignError },
      { data: chatPermRes, error: permError },
      { data: allTeams, error: teamsError }
    ] = await Promise.all([
      supabaseClient.from('user_teams').select('id, team_id, access_level, teams:team_id(id, name, is_personal_team)').eq('user_id', userId),
      supabaseClient.from('request_role_assignments').select('role_code, team_id, request_type, teams:team_id(name)').eq('user_id', userId).eq('is_active', true).order('role_code'),
      supabaseClient.from('chat_permissions').select('*').eq('user_id', userId).maybeSingle(),
      supabaseClient.from('teams').select('id, name').eq('is_personal_team', false).order('name')
    ]);

    if (memError) throw memError;
    if (assignError) throw assignError;
    if (permError) throw permError;
    if (teamsError) throw teamsError;

    const workTeams = (memberships || []).filter(m => !m.teams?.is_personal_team);
    const joinedTeamIds = new Set(workTeams.map(m => m.team_id));
    const availableTeams = (allTeams || []).filter(t => !joinedTeamIds.has(t.id));

    const displayName = escapeHtml(user.name || 'User');
    const displayEmail = escapeHtml(user.email || '—');
    editOnHoldValue = !!user.on_hold;

    const chatPerm = chatPermRes || {};
    const allowOpposite = !!chatPerm.allow_opposite_gender;
    const crossTeam = chatPerm.cross_team_access || 'none';
    const allowedUsersList = chatPerm.allowed_users || [];
    const allowedRolesList = chatPerm.allowed_roles || [];
    const allowedTeamsList = chatPerm.allowed_teams || [];

    const myGender = user.gender || '';
    const oppositeGenderUsers = myGender
      ? allUsersData.filter(u => u.id !== userId && u.gender && u.gender !== myGender && !u.on_hold)
      : allUsersData.filter(u => u.id !== userId && !u.on_hold);

    const content = `
      <div class="user-select-modal" style="padding:10px 0;">
        <h2 style="margin:0;">${displayName}</h2>
        <p class="user-select-email" style="margin:4px 0 16px;">${displayEmail}</p>

        <!-- Tab Buttons -->
        <div class="tabs-container" style="margin-bottom: 20px; display: flex; gap: 10px; border-bottom: 1px solid var(--border); padding-bottom: 10px;">
          <button type="button" class="tab-btn active" id="btnUserTabProfile" onclick="window.switchUserMgmtTab('profile')" style="background: none; border: none; padding: 8px 16px; cursor: pointer; font-weight: bold; border-bottom: 3px solid var(--primary); color: var(--text);">Identity & Roles</button>
          <button type="button" class="tab-btn" id="btnUserTabTeams" onclick="window.switchUserMgmtTab('teams')" style="background: none; border: none; padding: 8px 16px; cursor: pointer; color: var(--text-secondary);">Teams</button>
          <button type="button" class="tab-btn" id="btnUserTabPermissions" onclick="window.switchUserMgmtTab('permissions')" style="background: none; border: none; padding: 8px 16px; cursor: pointer; color: var(--text-secondary);">Permissions</button>
        </div>

        <!-- TAB 1: Identity & Roles -->
        <div id="userTabContentProfile" class="user-tab-content" style="display: block;">
          <form id="userEditForm" onsubmit="window.saveUserProfile(event)">
            <input type="hidden" id="editUserId" value="${userId}">
            <div class="form-grid">
              <div class="form-group">
                <label>Full name *</label>
                <input type="text" id="editUserName" required maxlength="120" value="${escapeHtml(user.name || '')}">
              </div>
              <div class="form-group">
                <label>Org role</label>
                <select id="editUserRole">${roleOptions(user.role || 'user')}</select>
              </div>
              <div class="form-group">
                <label>Allowed Views</label>
                <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:8px;">
                  <label><input type="checkbox" id="editViewTeam" checked disabled> Team (Required)</label>
                  <label><input type="checkbox" id="editViewManager" ${(user.allowed_views || []).includes('manager') ? 'checked' : ''}> Manager</label>
                  <label><input type="checkbox" id="editViewAdmin" ${(user.allowed_views || []).includes('admin') ? 'checked' : ''}> Admin</label>
                </div>
              </div>
              <div class="form-group">
                <label>Sign-in status</label>
                <div id="editUserOnHoldStatus" class="user-hold-status">
                  ${buildOnHoldStatusHtml(!!user.on_hold)}
                </div>
                <p class="section-hint" style="margin-top:6px;">Applies when you click Save changes.</p>
              </div>
            </div>

            <div class="btn-group" style="margin-top:20px;">
              <button type="submit" id="editUserSubmitBtn">Save changes</button>
              <button type="button" class="secondary" onclick="window.sendUserPasswordReset()">Send password reset email</button>
            </div>
          </form>
        </div>

        <!-- TAB 2: Teams -->
        <div id="userTabContentTeams" class="user-tab-content" style="display: none;">
          <h3>Work Teams</h3>
          <div class="table-container show-desktop">
            <table class="user-select-table">
              <thead>
                <tr><th>Team</th><th>Access</th><th>Actions</th></tr>
              </thead>
              <tbody>
                ${workTeams.length === 0 
                  ? '<tr><td colspan="3" class="empty-state">No work teams assigned.</td></tr>' 
                  : workTeams.map(m => `
                    <tr>
                      <td><strong>${escapeHtml(m.teams?.name)}</strong></td>
                      <td>
                        <select onchange="window.updateTeamAccessInlineUserMgmt('${m.team_id}', this.value)" style="padding:4px; border-radius:4px; border:1px solid var(--border); font-size:0.9em; background:var(--card-bg); color:var(--text);">
                          <option value="view" ${m.access_level === 'view' ? 'selected' : ''}>View only</option>
                          <option value="member" ${m.access_level === 'member' ? 'selected' : ''}>Member (OPS)</option>
                          <option value="lead" ${m.access_level === 'lead' ? 'selected' : ''}>Team lead (OPL)</option>
                          <option value="oht" ${m.access_level === 'oht' ? 'selected' : ''}>Operations head (OPH)</option>
                          <option value="admin" ${m.access_level === 'admin' ? 'selected' : ''}>Team admin</option>
                        </select>
                      </td>
                      <td>
                        <button type="button" class="danger small" onclick="window.removeTeamMemberInlineUserMgmt('${m.team_id}')">Remove</button>
                      </td>
                    </tr>
                  `).join('')}
              </tbody>
            </table>
          </div>
          <div class="show-mobile data-card-list">
            ${workTeams.map(m => `
              <article class="data-card data-card--compact">
                <div class="data-card-top">
                  <span class="data-card-title">${escapeHtml(m.teams?.name)}</span>
                  <button type="button" class="danger small" onclick="window.removeTeamMemberInlineUserMgmt('${m.team_id}')">Remove</button>
                </div>
                <div class="form-group" style="margin-top:8px;">
                  <label>Access Level</label>
                  <select onchange="window.updateTeamAccessInlineUserMgmt('${m.team_id}', this.value)" style="width:100%; padding:6px; border-radius:6px; border:1px solid var(--border); background:var(--card-bg); color:var(--text);">
                    <option value="view" ${m.access_level === 'view' ? 'selected' : ''}>View only</option>
                    <option value="member" ${m.access_level === 'member' ? 'selected' : ''}>Member (OPS)</option>
                    <option value="lead" ${m.access_level === 'lead' ? 'selected' : ''}>Team lead (OPL)</option>
                    <option value="oht" ${m.access_level === 'oht' ? 'selected' : ''}>Operations head (OPH)</option>
                    <option value="admin" ${m.access_level === 'admin' ? 'selected' : ''}>Team admin</option>
                  </select>
                </div>
              </article>
            `).join('')}
          </div>

          <h4 style="margin-top:20px;">Add to a Team</h4>
          <form id="okAddUserTeamForm" onsubmit="window.addTeamMemberInlineUserMgmt(event)" style="background:var(--bg-secondary); padding:12px; border-radius:8px; border:1px solid var(--border); margin-bottom:20px;">
            <div class="form-grid" style="align-items:flex-end; gap:16px; margin-bottom:12px;">
              <div class="form-group">
                <label for="okAddTeamSelect">Select Team</label>
                <select id="okAddTeamSelect" required style="width:100%;">
                  <option value="">Choose teamâ€¦</option>
                  ${availableTeams.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label for="okAddTeamAccess">Access Level</label>
                <select id="okAddTeamAccess" required style="width:100%;">
                  <option value="member">Member (OPS)</option>
                  <option value="lead">Team lead (OPL)</option>
                  <option value="oht">Operations head (OPH)</option>
                  <option value="view">View only</option>
                  <option value="admin">Team admin</option>
                </select>
              </div>
            </div>
            <button type="submit" id="okAddMemberBtn" ${availableTeams.length === 0 ? 'disabled' : ''}>Add Member</button>
          </form>

          <h3>Approval Roles (Pools)</h3>
          ${buildApprovalRolesSection(assignments || [])}
        </div>

        <!-- TAB 3: Permissions -->
        <div id="userTabContentPermissions" class="user-tab-content" style="display: none;">
          <h3>Konnect Clearances</h3>
          <div class="form-grid" style="margin-bottom:16px;">
            <div class="form-group" style="display:flex; align-items:center; gap:8px;">
              <input type="checkbox" id="editUserAllowOpposite" ${allowOpposite ? 'checked' : ''} style="cursor:pointer; width:16px; height:16px;">
              <label for="editUserAllowOpposite" style="cursor:pointer; font-weight:600; margin:0; user-select:none;">Allow opposite gender messaging</label>
            </div>
            <div class="form-group">
              <label for="editUserCrossTeam">Cross-team clearance</label>
              <select id="editUserCrossTeam" style="width:100%;">
                <option value="none" ${crossTeam === 'none' ? 'selected' : ''}>None (Shared teams only)</option>
                <option value="team" ${crossTeam === 'team' ? 'selected' : ''}>Team (All team channels visible)</option>
                <option value="global" ${crossTeam === 'global' ? 'selected' : ''}>Global (All users visible)</option>
              </select>
            </div>
          </div>

          <!-- Role Clearances Override -->
          <h4 style="margin:12px 0 6px;">Explicit Role Permissions</h4>
          <p class="section-hint" style="margin-bottom:8px;">Grant this user permission to message anyone with these roles, regardless of gender or team limits.</p>
          <div id="okAllowedRolesList" style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:16px;">
            <label style="cursor:pointer;"><input type="checkbox" data-role-clearance="fin" ${allowedRolesList.includes('fin') ? 'checked' : ''}> FIN</label>
            <label style="cursor:pointer;"><input type="checkbox" data-role-clearance="fip" ${allowedRolesList.includes('fip') ? 'checked' : ''}> FIP</label>
            <label style="cursor:pointer;"><input type="checkbox" data-role-clearance="oh" ${allowedRolesList.includes('oh') ? 'checked' : ''}> OH (FIH)</label>
            <label style="cursor:pointer;"><input type="checkbox" data-role-clearance="caoh" ${allowedRolesList.includes('caoh') ? 'checked' : ''}> CAOH (CAO)</label>
            <label style="cursor:pointer;"><input type="checkbox" data-role-clearance="ceo" ${allowedRolesList.includes('ceo') ? 'checked' : ''}> CEO</label>
            <label style="cursor:pointer;"><input type="checkbox" data-role-clearance="admin" ${allowedRolesList.includes('admin') ? 'checked' : ''}> Admin</label>
          </div>

          <!-- Team Clearances Override -->
          <h4 style="margin:12px 0 6px;">Explicit Team Permissions</h4>
          <p class="section-hint" style="margin-bottom:8px;">Grant this user permission to message anyone belonging to these teams, regardless of gender limits.</p>
          <div id="okAllowedTeamsList" style="max-height:120px; overflow-y:auto; border:1px solid var(--border); border-radius:6px; padding:8px; display:flex; flex-direction:column; gap:6px; background:var(--bg-secondary); margin-bottom:16px;">
            ${allTeams?.map(t => {
              const isChecked = allowedTeamsList.includes(t.id);
              return `<label style="cursor:pointer;"><input type="checkbox" data-team-clearance="${t.id}" ${isChecked ? 'checked' : ''}> ${escapeHtml(t.name)}</label>`;
            }).join('')}
          </div>

          <!-- Opposite Gender Bulk Filter Checkbox List -->
          <h4 style="margin:12px 0 6px;">Explicit Individual Clearances</h4>
          <p class="section-hint" style="margin-bottom:12px;">Search and whitelist specific individuals (e.g. opposite-gender) for direct chat override.</p>
          
          <div class="form-grid-row" style="display:flex; gap:10px; margin-bottom:12px;">
            <input type="text" id="okOppositeSearch" placeholder="Search name/email..." oninput="window.filterOppositeGenderUsersUserMgmt()" style="flex:1; height:36px; padding:6px; border:1px solid var(--border); border-radius:6px;">
            <select id="okOppositeRoleFilter" onchange="window.filterOppositeGenderUsersUserMgmt()" style="width:160px; height:36px; border-radius:6px; border:1px solid var(--border); padding:6px;">
              <option value="">All Roles</option>
              <option value="user">User</option>
              <option value="fin">FIN</option>
              <option value="fip">FIP</option>
              <option value="oh">OH</option>
              <option value="caoh">CAOH</option>
              <option value="ceo">CEO</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div style="margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
            <label style="font-size:0.85em; font-weight:600; cursor:pointer; color:var(--text);">
              <input type="checkbox" id="okSelectAllOpposite" onchange="window.toggleSelectAllOppositeUserMgmt(this.checked)"> Select All Matching
            </label>
            <span id="okOppositeCount" style="font-size:0.8em; color:var(--text-secondary);">0 matched</span>
          </div>

          <div id="okOppositeList" style="max-height:150px; overflow-y:auto; border:1px solid var(--border); border-radius:6px; padding:8px; background:var(--bg-secondary); display:flex; flex-direction:column; gap:6px; margin-bottom:20px;">
            <!-- Loaded dynamically -->
          </div>

          <div class="btn-group">
            <button type="button" class="success" onclick="window.savePermissionsOnlyUserMgmt()">Save Clearances</button>
          </div>
        </div>
      </div>
    `;

    removeModal(USER_SELECT_MODAL_ID);
    createModal(USER_SELECT_MODAL_ID, content, { maxWidth: '720px' });
    wireUserSelectModal();
    openModal(USER_SELECT_MODAL_ID);

    // Bind local state overrides
    window.currentAllowedUsersUserMgmt = new Set(allowedUsersList);
    window.oppositeGenderUsersUserMgmt = oppositeGenderUsers;
    window.filterOppositeGenderUsersUserMgmt();

  } catch (err) {
    console.error('Load user detail:', err);
    removeModal(USER_SELECT_MODAL_ID);
    createModal(USER_SELECT_MODAL_ID, `<p class="empty-state" style="color:#dc3545;">${escapeHtml(err.message)}</p>`, { maxWidth: '720px' });
    wireUserSelectModal();
    openModal(USER_SELECT_MODAL_ID);
  }
}

// User-Mgmt Tab Switcher
window.switchUserMgmtTab = (tabName) => {
  const tabProfile = document.getElementById('userTabContentProfile');
  const tabTeams = document.getElementById('userTabContentTeams');
  const tabPermissions = document.getElementById('userTabContentPermissions');
  const btnProfile = document.getElementById('btnUserTabProfile');
  const btnTeams = document.getElementById('btnUserTabTeams');
  const btnPermissions = document.getElementById('btnUserTabPermissions');

  if (tabProfile) tabProfile.style.display = tabName === 'profile' ? 'block' : 'none';
  if (tabTeams) tabTeams.style.display = tabName === 'teams' ? 'block' : 'none';
  if (tabPermissions) tabPermissions.style.display = tabName === 'permissions' ? 'block' : 'none';

  [btnProfile, btnTeams, btnPermissions].forEach(btn => {
    if (btn) {
      btn.classList.remove('active');
      btn.style.borderBottom = 'none';
      btn.style.color = 'var(--text-secondary)';
      btn.style.fontWeight = 'normal';
    }
  });

  const activeBtn = document.getElementById(`btnUserTab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
  if (activeBtn) {
    activeBtn.classList.add('active');
    activeBtn.style.borderBottom = '3px solid var(--primary)';
    activeBtn.style.color = 'var(--text)';
    activeBtn.style.fontWeight = 'bold';
  }
};

// Inline team modifiers for User-Mgmt Modal
window.updateTeamAccessInlineUserMgmt = async (teamId, accessLevel) => {
  try {
    const { error } = await supabaseClient
      .from('user_teams')
      .update({ access_level: accessLevel })
      .eq('user_id', editingUserId)
      .eq('team_id', teamId);
    if (error) throw error;
    showToast('Team membership access updated', 'success');
  } catch (err) {
    showToast(err.message || 'Update failed', 'error');
  }
};

window.removeTeamMemberInlineUserMgmt = async (teamId) => {
  const ok = await showConfirm('Remove this user from the team?');
  if (!ok) return;
  try {
    const { error } = await supabaseClient
      .from('user_teams')
      .delete()
      .eq('user_id', editingUserId)
      .eq('team_id', teamId);
    if (error) throw error;
    showToast('Member removed from team', 'success');
    openUserSelect(editingUserId);
  } catch (err) {
    showToast(err.message || 'Remove failed', 'error');
  }
};

window.addTeamMemberInlineUserMgmt = async (e) => {
  e.preventDefault();
  const teamId = document.getElementById('okAddTeamSelect').value;
  const accessLevel = document.getElementById('okAddTeamAccess').value;
  if (!teamId) return;

  const btn = document.getElementById('okAddMemberBtn');
  setButtonLoading(btn, true, 'Adding');
  try {
    const { error } = await supabaseClient
      .from('user_teams')
      .insert({
        user_id: editingUserId,
        team_id: teamId,
        access_level: accessLevel,
        is_active: true
      });
    if (error) throw error;

    const user = allUsersData.find(u => u.id === editingUserId);
    try {
      await ensureMemberBucketOnWorkTeam(teamId, editingUserId, user?.name || 'Member', state.user?.id);
    } catch (_) {}

    showToast('User added to team', 'success');
    openUserSelect(editingUserId);
  } catch (err) {
    showToast(err.message || 'Addition failed', 'error');
  } finally {
    setButtonLoading(btn, false, 'Add Member');
  }
};

// Filter opposite gender list inside user-mgmt modal
window.filterOppositeGenderUsersUserMgmt = () => {
  const q = (document.getElementById('okOppositeSearch')?.value || '').trim().toLowerCase();
  const roleFilter = document.getElementById('okOppositeRoleFilter')?.value || '';
  const container = document.getElementById('okOppositeList');
  const countEl = document.getElementById('okOppositeCount');
  if (!container) return;

  const matched = window.oppositeGenderUsersUserMgmt.filter(u => {
    const textMatch = !q || (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
    const roleMatch = !roleFilter || u.role === roleFilter;
    return textMatch && roleMatch;
  });

  if (countEl) countEl.innerText = `${matched.length} matched`;

  if (matched.length === 0) {
    container.innerHTML = `<p class="empty-state" style="font-size:0.85em; margin:0;">No matching users found.</p>`;
    return;
  }

  container.innerHTML = matched.map(u => {
    const isChecked = window.currentAllowedUsersUserMgmt.has(u.id);
    return `
      <label style="display:flex; align-items:center; gap:8px; font-size:0.9em; cursor:pointer;">
        <input type="checkbox" data-opposite-user-id="${u.id}" ${isChecked ? 'checked' : ''} onchange="window.toggleIndividualClearanceInlineUserMgmt('${u.id}', this.checked)">
        <strong>${escapeHtml(u.name)}</strong> (${escapeHtml(u.role || 'user')})
      </label>
    `;
  }).join('');
};

window.toggleIndividualClearanceInlineUserMgmt = (targetId, isChecked) => {
  if (isChecked) {
    window.currentAllowedUsersUserMgmt.add(targetId);
  } else {
    window.currentAllowedUsersUserMgmt.delete(targetId);
  }
};

window.toggleSelectAllOppositeUserMgmt = (isChecked) => {
  const checkboxes = document.querySelectorAll('#okOppositeList input[data-opposite-user-id]');
  checkboxes.forEach(cb => {
    cb.checked = isChecked;
    const uid = cb.dataset.oppositeUserId;
    if (isChecked) {
      window.currentAllowedUsersUserMgmt.add(uid);
    } else {
      window.currentAllowedUsersUserMgmt.delete(uid);
    }
  });
};

window.savePermissionsOnlyUserMgmt = async () => {
  try {
    const allowOpposite = document.getElementById('editUserAllowOpposite')?.checked || false;
    const crossTeam = document.getElementById('editUserCrossTeam')?.value || 'none';
    const allowedUsersArray = Array.from(window.currentAllowedUsersUserMgmt || []);
    const allowedRolesArray = [...document.querySelectorAll('#okAllowedRolesList input[data-role-clearance]:checked')].map(el => el.dataset.roleClearance);
    const allowedTeamsArray = [...document.querySelectorAll('#okAllowedTeamsList input[data-team-clearance]:checked')].map(el => el.dataset.teamClearance);

    const { error: permError } = await supabaseClient
      .from('chat_permissions')
      .upsert({
        user_id: editingUserId,
        allow_opposite_gender: allowOpposite,
        cross_team_access: crossTeam,
        allowed_users: allowedUsersArray,
        allowed_roles: allowedRolesArray,
        allowed_teams: allowedTeamsArray
      });

    if (permError) throw permError;
    showToast('Permissions saved successfully', 'success');
  } catch (err) {
    showToast(err.message || 'Permissions save failed', 'error');
  }
};

function buildOnHoldStatusHtml(onHold) {
  const badge = onHold
    ? '<span class="badge badge-danger">On hold</span>'
    : '<span class="badge badge-success">Active</span>';
  const btnLabel = onHold ? 'Remove hold' : 'Place on hold';
  const btnClass = onHold ? 'secondary' : 'danger';
  return `
    <div class="btn-group" style="align-items:center;gap:10px;">
      ${badge}
      <button type="button" class="${btnClass} small" id="editUserOnHoldBtn" onclick="window.confirmUserOnHoldToggle()">${btnLabel}</button>
    </div>
  `;
}

function renderEditOnHoldStatus() {
  const wrap = document.getElementById('editUserOnHoldStatus');
  if (wrap) wrap.innerHTML = buildOnHoldStatusHtml(editOnHoldValue);
}

function confirmUserOnHoldToggle() {
  const userId = document.getElementById('editUserId')?.value;
  const user = allUsersData.find(u => u.id === userId);
  const name = user?.name || user?.email || 'this user';
  const placingOnHold = !editOnHoldValue;

  if (placingOnHold && userId === state.user?.id) {
    showToast('You cannot place your own account on hold', 'error');
    return;
  }

  if (placingOnHold) {
    showConfirm(
      `Place <strong>${escapeHtml(name)}</strong> on hold? They will not be able to sign in until hold is removed.`,
      () => {
        editOnHoldValue = true;
        renderEditOnHoldStatus();
      }
    );
  } else {
    showConfirm(
      `Remove hold for <strong>${escapeHtml(name)}</strong>? They will be able to sign in again.`,
      () => {
        editOnHoldValue = false;
        renderEditOnHoldStatus();
      }
    );
  }
}

function formatInvokeError(data, error, rawText = '') {
  const candidates = [
    data?.error,
    data?.message,
    data?.msg,
    data?.warning,
  ];

  for (const c of candidates) {
    if (typeof c === 'string' && c.trim() && c.trim() !== '{}') return c.trim();
    if (c && typeof c === 'object') {
      const nested = c.message || c.msg || c.error_description;
      if (typeof nested === 'string' && nested.trim()) return nested.trim();
    }
  }

  if (typeof rawText === 'string' && rawText.trim() && rawText.trim() !== '{}') {
    return rawText.trim().slice(0, 300);
  }

  if (error?.message && error.message !== 'Edge Function returned a non-2xx status code') {
    return error.message;
  }

  return '';
}

async function createAppUser(e) {
  e.preventDefault();

  const email = document.getElementById('newUserEmail')?.value?.trim();
  const name = document.getElementById('newUserName')?.value?.trim();
  const password = document.getElementById('newUserPassword')?.value || '';
  const role = document.getElementById('newUserRole')?.value || 'user';
  const team_id = document.getElementById('newUserTeam')?.value || null;
  const access_level = document.getElementById('newUserAccess')?.value || 'member';

  if (!email || !name || password.length < 8) {
    showToast('Email, full name, and password (min 8 characters) are all required', 'error');
    return;
  }

  const btn = document.getElementById('newUserSubmitBtn');
  setButtonLoading(btn, true, 'Create user');

  try {
    // Use supabaseClient.functions.invoke() which routes through the
    // custom proxy fetch in db.js. The proxy reads the sb-access-token
    // HttpOnly cookie and adds the correct Authorization header.
    // (supabaseClient.auth.getSession() always returns null because the
    //  client is configured with persistSession:false and autoRefreshToken:false.)
    const { data, error: invokeError } = await supabaseClient.functions.invoke('create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        email,
        name,
        password,
        role,
        team_id: team_id || null,
        access_level
      }
    });

    // FunctionsHttpError — invokeError.context is the Response object
    if (invokeError) {
      const ctx = invokeError.context;
      let rawText = '';
      let parsed = null;

      if (ctx) {
        try {
          rawText = await ctx.clone().text();
          parsed = rawText ? JSON.parse(rawText) : null;
        } catch (_) {
          // parse failed, keep rawText as-is
        }
      }

      console.error('Create user response:', invokeError, rawText);

      if (parsed?.error || !rawText) {
        const detail = formatInvokeError(parsed, null, rawText)
          || `Create user failed. If you tried this email before, delete it in Supabase → Authentication → Users, then try again.`;

        // If function was not updated, body is still {"error":"{}" } with no fn version
        if (!parsed?.fn && (rawText.includes('"error":"{}"') || rawText === '{"error":"{}"}')) {
          throw new Error(
            'The create-user function in Supabase is still the OLD version. ' +
            'Open Edge Functions → create-user, paste the new code from Cursor, click Deploy, ' +
            'then confirm the code contains the text create-user-v4 before trying again.'
          );
        }

        throw new Error(detail);
      }
    }

    if (data?.error) throw new Error(formatInvokeError(data, null, '') || data.error);
    if (!data?.user_id) throw new Error('Create user failed — no user id returned');

    if (data.warning) {
      showToast(data.warning, 'warning');
    }

    if (team_id && data?.user_id) {
      try {
        await ensureMemberBucketOnWorkTeam(team_id, data.user_id, name, state.user?.id);
      } catch (mbErr) {
        console.warn('Member bucket after create:', mbErr);
      }
    }

    showToast(`User ${email} created — personal team ready`, 'success');
    document.getElementById('userCreateForm')?.reset();
    toggleUserCreateCard(false);
    await loadUserMgmtList();
  } catch (err) {
    console.error('Create user:', err);
    const msg = (typeof err?.message === 'string' && err.message !== '{}')
      ? err.message
      : 'Failed to create user';
    showToast(msg, 'error');
  } finally {
    setButtonLoading(btn, false, 'Create user');
  }
}

async function saveUserProfile(e) {
  e.preventDefault();
  const userId = document.getElementById('editUserId')?.value;
  const name = document.getElementById('editUserName')?.value?.trim();
  const existing = allUsersData.find(u => u.id === userId);
  let role = String(document.getElementById('editUserRole')?.value || existing?.role || 'user')
    .toLowerCase()
    .trim();
  const allowed = assignableOrgRoles();
  if (!allowed.includes(role)) {
    role = String(existing?.role || 'user').toLowerCase().trim();
  }
  const on_hold = !!editOnHoldValue;

  if (!userId || !name) {
    showToast('Name is required', 'error');
    return;
  }

  if (userId === state.user?.id && on_hold) {
    showToast('You cannot place your own account on hold', 'error');
    return;
  }

  const btn = document.getElementById('editUserSubmitBtn');
  setButtonLoading(btn, true, 'Save changes');

  try {
    const { error } = await supabaseClient
      .from('users')
      .update({ name, role, on_hold, allowed_views: allowedViews })
      .eq('id', userId);

    if (error) throw error;

    const idx = allUsersData.findIndex(u => u.id === userId);
    if (idx >= 0) {
      allUsersData[idx] = { ...allUsersData[idx], name, role, on_hold, allowed_views: allowedViews };
    }

    // Active filter hides on-hold users — switch to All so the new status is visible
    const statusFilter = document.getElementById('userMgmtStatusFilter');
    if (statusFilter && on_hold && statusFilter.value === 'active') {
      statusFilter.value = 'all';
    }

    showToast(on_hold ? 'User updated — on hold' : 'User updated', 'success');
    closeUserSelectModal();
    filterUserMgmtList();
    await loadUserMgmtList();
  } catch (err) {
    console.error('Save user:', err);
    showToast(err.message || 'Failed to save user', 'error');
  } finally {
    setButtonLoading(btn, false, 'Save changes');
  }
}

async function sendUserPasswordReset() {
  const userId = document.getElementById('editUserId')?.value;
  const user = allUsersData.find(u => u.id === userId);
  const email = user?.email?.trim();
  if (!email) return;

  try {
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    });
    if (error) throw error;
    showToast(`Password reset email sent to ${email}`, 'success');
  } catch (err) {
    showToast(err.message || 'Failed to send reset email', 'error');
  }
}


