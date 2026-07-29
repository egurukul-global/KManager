// ==================== USER MANAGEMENT (Phase 4C Lite) ====================
import { state } from '../state.js';
import { supabaseClient, SUPABASE_URL, SUPABASE_ANON_KEY } from '../db.js';
import { showToast, showConfirm } from '../components/toasts.js';
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

    <div class="card">
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
            <tr><td colspan="6" class="empty-state">Loading…</td></tr>
          </tbody>
        </table>
      </div>
      <div id="userMgmtMobile" class="show-mobile data-card-list"></div>
    </div>
  `;
}

export async function initUserMgmtPage() {
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

  if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Loading…</td></tr>';
  if (mobile) mobile.innerHTML = '<p class="empty-state">Loading…</p>';

  try {
    const { data: users, error } = await supabaseClient
      .from('users')
      .select('id, email, name, role, on_hold, request_alias, gender')
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
  createModal(USER_SELECT_MODAL_ID, '<p class="empty-state">Loading user…</p>', { maxWidth: '720px' });
  wireUserSelectModal();
  openModal(USER_SELECT_MODAL_ID);

  try {
    const [
      { data: memberships, error: memError }, 
      { data: assignments, error: assignError },
      { data: chatPerm, error: permError }
    ] = await Promise.all([
      supabaseClient
        .from('user_teams')
        .select('access_level, team_id, teams:team_id(id, name, is_personal_team)')
        .eq('user_id', userId),
      supabaseClient
        .from('request_role_assignments')
        .select('role_code, team_id, request_type, teams:team_id(name)')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('role_code'),
      supabaseClient
        .from('chat_permissions')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()
    ]);

    if (memError) throw memError;
    if (assignError) throw assignError;
    if (permError) throw permError;

    const workTeams = (memberships || [])
      .filter(m => !m.teams?.is_personal_team)
      .sort((a, b) => (a.teams?.name || '').localeCompare(b.teams?.name || ''));

    const displayName = escapeHtml(user.name || 'User');
    const displayEmail = escapeHtml(user.email || '—');
    editOnHoldValue = !!user.on_hold;

    const allowOpposite = chatPerm ? chatPerm.allow_opposite_gender : false;
    const crossTeam = chatPerm ? chatPerm.cross_team_access : 'none';
    const allowedUsersList = chatPerm?.allowed_users || [];

    const myGender = user.gender || '';
    const oppositeGenderUsers = myGender
      ? allUsersData.filter(u => u.gender && u.gender !== myGender && !u.on_hold)
      : [];

    const content = `
      <div class="user-select-modal">
        <h2>${displayName}</h2>
        <p class="user-select-email">${displayEmail}</p>

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
              <label>Sign-in status</label>
              <div id="editUserOnHoldStatus" class="user-hold-status">
                ${buildOnHoldStatusHtml(!!user.on_hold)}
              </div>
              <p class="section-hint" style="margin-top:6px;">Applies when you click Save changes.</p>
            </div>
          </div>

          <div style="border-top:1px solid var(--border); margin:16px 0; padding-top:16px;">
            <h4 style="margin:0 0 12px; font-size:0.95em; color:var(--text);">Konnect Permissions</h4>
            <div class="form-grid">
              <div class="form-group" style="display:flex; align-items:center; gap:8px; margin:0;">
                <input type="checkbox" id="editUserAllowOpposite" ${allowOpposite ? 'checked' : ''} style="cursor:pointer; width:16px; height:16px;">
                <label for="editUserAllowOpposite" style="cursor:pointer; font-weight:600; margin:0; user-select:none; font-size:0.9em; color:var(--text);">Allow opposite gender messaging</label>
              </div>
              <div class="form-group">
                <label>Cross-team clearance</label>
                <select id="editUserCrossTeam" style="width:100%; height:38px; border-radius:6px; border:1px solid var(--border); padding:6px; font-size:0.9em; background:var(--card-bg); color:var(--text);">
                  <option value="none" ${crossTeam === 'none' ? 'selected' : ''}>None (Shared teams only)</option>
                  <option value="team" ${crossTeam === 'team' ? 'selected' : ''}>Team (All team channels visible)</option>
                  <option value="global" ${crossTeam === 'global' ? 'selected' : ''}>Global (All users visible)</option>
                </select>
              </div>
            </div>
            
            <div style="margin-top:12px;">
              <label style="font-weight:600; font-size:0.85em; display:block; margin-bottom:4px; color:var(--text);">Allowed opposite-gender contacts</label>
              <p class="section-hint" style="margin-bottom:8px;">Check specific users of the opposite gender that this user is explicitly allowed to message directly.</p>
              <div id="oppositeGenderClearanceList" style="max-height:120px; overflow-y:auto; background:var(--bg-secondary); border:1px solid var(--border); border-radius:6px; padding:8px; display:flex; flex-direction:column; gap:6px;">
                ${oppositeGenderUsers.length === 0 
                  ? '<p class="empty-state" style="font-size:0.8em; margin:0; color:var(--text-secondary);">No opposite gender users found (make sure gender is set on profiles).</p>' 
                  : oppositeGenderUsers.map(u => {
                      const isChecked = allowedUsersList.includes(u.id);
                      return `
                        <label style="display:flex; align-items:center; gap:6px; font-size:0.85em; cursor:pointer; color:var(--text);">
                          <input type="checkbox" data-opposite-user-id="${u.id}" ${isChecked ? 'checked' : ''}> ${escapeHtml(u.name)} (${escapeHtml(u.role || 'user')})
                        </label>
                      `;
                    }).join('')}
              </div>
            </div>
          </div>

          <div class="btn-group">
            <button type="submit" id="editUserSubmitBtn">Save changes</button>
            <button type="button" class="secondary" onclick="window.sendUserPasswordReset()">Send password reset email</button>
          </div>
        </form>

        <div class="user-select-section">
          <h3>Work teams</h3>
          <p class="section-hint">Read-only. Click a team to open it in Teams, or use the link below to manage membership.</p>
          ${buildWorkTeamsSection(workTeams)}
        </div>

        <div class="user-select-section">
          <h3>Approval roles</h3>
          <p class="section-hint">Read-only pool assignments for budget, reconciliation, and other approval flows.</p>
          ${buildApprovalRolesSection(assignments || [])}
        </div>
      </div>
    `;

    removeModal(USER_SELECT_MODAL_ID);
    createModal(USER_SELECT_MODAL_ID, content, { maxWidth: '720px' });
    wireUserSelectModal();
    openModal(USER_SELECT_MODAL_ID);
  } catch (err) {
    console.error('Load user detail:', err);
    removeModal(USER_SELECT_MODAL_ID);
    createModal(USER_SELECT_MODAL_ID, `<p class="empty-state" style="color:#dc3545;">${escapeHtml(err.message)}</p>`, { maxWidth: '720px' });
    wireUserSelectModal();
    openModal(USER_SELECT_MODAL_ID);
  }
}

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
    const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError) throw sessionError;
    const token = sessionData?.session?.access_token;
    if (!token) throw new Error('You are not signed in. Sign out and sign in again, then retry.');

    const res = await fetch(`${SUPABASE_URL}/functions/v1/create-user`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        name,
        password,
        role,
        team_id: team_id || null,
        access_level
      })
    });

    const rawText = await res.text();
    let data = null;
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch (_) {
      data = null;
    }

    console.error('Create user response:', res.status, rawText);

    if (!res.ok) {
      const detail = formatInvokeError(data, null, rawText)
        || `Create user failed (server code ${res.status}). If you tried this email before, delete it in Supabase → Authentication → Users, then try again.`;

      // If function was not updated, body is still {"error":"{}" } with no fn version
      if (!data?.fn && (rawText.includes('"error":"{}"') || rawText === '{"error":"{}"}')) {
        throw new Error(
          'The create-user function in Supabase is still the OLD version. ' +
          'Open Edge Functions → create-user, paste the new code from Cursor, click Deploy, ' +
          'then confirm the code contains the text create-user-v4 before trying again.'
        );
      }

      throw new Error(detail);
    }

    if (data?.error) throw new Error(formatInvokeError(data, null, rawText) || data.error);
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
      .update({ name, role, on_hold })
      .eq('id', userId);

    if (error) throw error;

    // Save chat permissions
    const allowOpposite = document.getElementById('editUserAllowOpposite')?.checked || false;
    const crossTeam = document.getElementById('editUserCrossTeam')?.value || 'none';
    const checkedOppositeUserIds = [...document.querySelectorAll('#oppositeGenderClearanceList input[data-opposite-user-id]:checked')].map(el => el.dataset.oppositeUserId);

    const { error: permError } = await supabaseClient
      .from('chat_permissions')
      .upsert({
        user_id: userId,
        allow_opposite_gender: allowOpposite,
        cross_team_access: crossTeam,
        allowed_users: checkedOppositeUserIds
      });

    if (permError) throw permError;

    const idx = allUsersData.findIndex(u => u.id === userId);
    if (idx >= 0) {
      allUsersData[idx] = { ...allUsersData[idx], name, role, on_hold };
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
