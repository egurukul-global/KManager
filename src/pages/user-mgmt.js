// ==================== USER MANAGEMENT (Phase 4C Lite) ====================
import { state } from '../state.js';
import { supabaseClient } from '../db.js';
import { showToast } from '../components/toasts.js';
import { cardRow, setButtonLoading } from '../utils/uiHelpers.js';
import {
  canManageUsers,
  assignableOrgRoles,
  orgRoleLabel
} from '../utils/userMgmtAccess.js';
import { ensureMemberBucketOnWorkTeam } from '../utils/memberBucketHelpers.js';

let usersCache = [];
let teamsCache = [];
let editingUserId = null;

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

function roleOptions(selected = 'user') {
  return assignableOrgRoles().map(r => {
    const sel = r === selected ? ' selected' : '';
    return `<option value="${r}"${sel}>${orgRoleLabel(r)}</option>`;
  }).join('');
}

function accessOptions(selected = 'member') {
  return ACCESS_LEVELS.map(l => {
    const sel = l.value === selected ? ' selected' : '';
    return `<option value="${l.value}"${sel}>${l.label}</option>`;
  }).join('');
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
    <p class="page-intro">Create accounts, place users on hold, and set org roles. Assign work teams under <strong>Admin → Teams</strong> or when creating a user.</p>

    <div class="card">
      <div class="form-grid-row form-grid-row--user-filters">
        <div class="form-group">
          <label>Search</label>
          <input type="text" id="userMgmtSearch" placeholder="Name or email" onkeydown="if(event.key==='Enter')window.loadUserMgmtList()">
        </div>
        <div class="form-group">
          <label>Status</label>
          <select id="userMgmtStatusFilter" onchange="window.loadUserMgmtList()">
            <option value="active">Active</option>
            <option value="hold">On hold</option>
            <option value="all">All</option>
          </select>
        </div>
        <div class="form-group user-mgmt-filter-actions">
          <label>&nbsp;</label>
          <div class="btn-group">
            <button type="button" onclick="window.loadUserMgmtList()">Refresh</button>
            <button type="button" class="success" onclick="window.toggleUserCreateCard(true)">+ New user</button>
          </div>
        </div>
      </div>
    </div>

    <div class="card" id="userCreateCard" style="display:none;">
      <h2>New user</h2>
      <form id="userCreateForm" onsubmit="window.createAppUser(event)">
        <div class="form-grid">
          <div class="form-group">
            <label>Email *</label>
            <input type="email" id="newUserEmail" required placeholder="user@example.com">
          </div>
          <div class="form-group">
            <label>Full name *</label>
            <input type="text" id="newUserName" required maxlength="120" placeholder="First Last">
          </div>
          <div class="form-group">
            <label>Temporary password *</label>
            <input type="password" id="newUserPassword" required minlength="8" placeholder="Min 8 characters">
            <p class="form-hint">Share securely; user can change via Forgot password on login.</p>
          </div>
          <div class="form-group">
            <label>Org role</label>
            <select id="newUserRole">${roleOptions('user')}</select>
          </div>
          <div class="form-group">
            <label>Work team (optional)</label>
            <select id="newUserTeam">
              <option value="">None — assign later in Teams</option>
            </select>
          </div>
          <div class="form-group">
            <label>Team access (if team selected)</label>
            <select id="newUserAccess">${accessOptions('member')}</select>
          </div>
        </div>
        <div class="btn-group">
          <button type="submit" id="newUserSubmitBtn">Create user</button>
          <button type="button" class="secondary" onclick="window.toggleUserCreateCard(false)">Cancel</button>
        </div>
      </form>
    </div>

    <div class="card" id="userEditCard" style="display:none;">
      <h2>Edit user</h2>
      <form id="userEditForm" onsubmit="window.saveUserProfile(event)">
        <input type="hidden" id="editUserId">
        <div class="form-grid">
          <div class="form-group">
            <label>Email</label>
            <input type="email" id="editUserEmail" disabled>
          </div>
          <div class="form-group">
            <label>Full name *</label>
            <input type="text" id="editUserName" required maxlength="120">
          </div>
          <div class="form-group">
            <label>Org role</label>
            <select id="editUserRole"></select>
          </div>
          <div class="form-group">
            <label class="checkbox-label" style="margin-top:28px;">
              <input type="checkbox" id="editUserOnHold">
              On hold — cannot sign in
            </label>
          </div>
        </div>
        <div class="btn-group">
          <button type="submit" id="editUserSubmitBtn">Save changes</button>
          <button type="button" class="secondary" onclick="window.closeUserEdit()">Cancel</button>
          <button type="button" class="secondary" onclick="window.sendUserPasswordReset()">Send password reset email</button>
        </div>
      </form>
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
  window.toggleUserCreateCard = toggleUserCreateCard;
  window.createAppUser = createAppUser;
  window.openUserEdit = openUserEdit;
  window.closeUserEdit = closeUserEdit;
  window.saveUserProfile = saveUserProfile;
  window.sendUserPasswordReset = sendUserPasswordReset;

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
  if (show) closeUserEdit();
}

function closeUserEdit() {
  editingUserId = null;
  const card = document.getElementById('userEditCard');
  if (card) card.style.display = 'none';
}

async function loadUserMgmtList() {
  const tbody = document.getElementById('userMgmtTableBody');
  const mobile = document.getElementById('userMgmtMobile');
  const search = (document.getElementById('userMgmtSearch')?.value || '').trim().toLowerCase();
  const statusFilter = document.getElementById('userMgmtStatusFilter')?.value || 'active';

  if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Loading…</td></tr>';
  if (mobile) mobile.innerHTML = '<p class="empty-state">Loading…</p>';

  try {
    const { data: users, error } = await supabaseClient
      .from('users')
      .select('id, email, name, role, on_hold, request_alias')
      .order('name');

    if (error) throw error;

    const { data: memberships } = await supabaseClient
      .from('user_teams')
      .select('user_id, team_id, teams:team_id(name, is_personal_team)')
      .order('user_id');

    const teamCountMap = {};
    (memberships || []).forEach(m => {
      if (m.teams?.is_personal_team) return;
      teamCountMap[m.user_id] = (teamCountMap[m.user_id] || 0) + 1;
    });

    usersCache = (users || []).filter(u => {
      if (statusFilter === 'active' && u.on_hold) return false;
      if (statusFilter === 'hold' && !u.on_hold) return false;
      if (!search) return true;
      const hay = `${u.name || ''} ${u.email || ''}`.toLowerCase();
      return hay.includes(search);
    });

    if (!usersCache.length) {
      const empty = '<p class="empty-state">No users match these filters.</p>';
      if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No users match these filters.</td></tr>';
      if (mobile) mobile.innerHTML = empty;
      return;
    }

    let tableHtml = '';
    let mobileHtml = '';

    usersCache.forEach(user => {
      const statusBadge = user.on_hold
        ? '<span class="badge badge-danger">On hold</span>'
        : '<span class="badge badge-success">Active</span>';
      const teams = teamCountMap[user.id] || 0;
      const teamsLabel = teams === 1 ? '1 work team' : `${teams} work teams`;

      tableHtml += `
        <tr>
          <td data-label="Name"><strong>${escapeHtml(user.name || '—')}</strong></td>
          <td data-label="Email">${escapeHtml(user.email || '—')}</td>
          <td data-label="Org role">${orgRoleLabel(user.role)}</td>
          <td data-label="Teams">${teamsLabel}</td>
          <td data-label="Status">${statusBadge}</td>
          <td data-label="Actions">
            <button type="button" class="small secondary" onclick="window.openUserEdit('${user.id}')">Edit</button>
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
            <button type="button" class="small secondary" onclick="window.openUserEdit('${user.id}')">Edit</button>
          </div>
        </article>
      `;
    });

    if (tbody) tbody.innerHTML = tableHtml;
    if (mobile) mobile.innerHTML = mobileHtml;
  } catch (err) {
    console.error('Load users:', err);
    const msg = escapeHtml(err.message);
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="empty-state" style="color:#dc3545;">${msg}</td></tr>`;
    if (mobile) mobile.innerHTML = `<p class="empty-state" style="color:#dc3545;">${msg}</p>`;
  }
}

function openUserEdit(userId) {
  const user = usersCache.find(u => u.id === userId);
  if (!user) return;

  editingUserId = userId;
  toggleUserCreateCard(false);

  document.getElementById('editUserId').value = userId;
  document.getElementById('editUserEmail').value = user.email || '';
  document.getElementById('editUserName').value = user.name || '';
  document.getElementById('editUserRole').innerHTML = roleOptions(user.role || 'user');
  document.getElementById('editUserOnHold').checked = !!user.on_hold;

  const card = document.getElementById('userEditCard');
  if (card) {
    card.style.display = '';
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

async function createAppUser(e) {
  e.preventDefault();

  const email = document.getElementById('newUserEmail')?.value?.trim();
  const name = document.getElementById('newUserName')?.value?.trim();
  const password = document.getElementById('newUserPassword')?.value || '';
  const role = document.getElementById('newUserRole')?.value || 'user';
  const team_id = document.getElementById('newUserTeam')?.value || null;
  const access_level = document.getElementById('newUserAccess')?.value || 'member';

  const btn = document.getElementById('newUserSubmitBtn');
  setButtonLoading(btn, true, 'Create user');

  try {
    const { data, error } = await supabaseClient.functions.invoke('create-user', {
      body: { email, name, password, role, team_id, access_level }
    });

    if (error) throw error;
    if (data?.error) throw new Error(data.error);

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
    const msg = err.message || 'Failed to create user';
    if (msg.includes('FunctionsFetchError') || msg.includes('Failed to send')) {
      showToast('Create-user function not deployed. Run: supabase functions deploy create-user', 'error');
    } else {
      showToast(msg, 'error');
    }
  } finally {
    setButtonLoading(btn, false, 'Create user');
  }
}

async function saveUserProfile(e) {
  e.preventDefault();
  const userId = document.getElementById('editUserId')?.value;
  const name = document.getElementById('editUserName')?.value?.trim();
  const role = document.getElementById('editUserRole')?.value || 'user';
  const on_hold = !!document.getElementById('editUserOnHold')?.checked;

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

    showToast(on_hold ? 'User updated — on hold' : 'User updated', 'success');
    closeUserEdit();
    await loadUserMgmtList();
  } catch (err) {
    console.error('Save user:', err);
    showToast(err.message || 'Failed to save user', 'error');
  } finally {
    setButtonLoading(btn, false, 'Save changes');
  }
}

async function sendUserPasswordReset() {
  const email = document.getElementById('editUserEmail')?.value?.trim();
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
