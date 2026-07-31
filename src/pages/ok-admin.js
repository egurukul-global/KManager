import { state } from '../state.js';
import { supabaseClient, SUPABASE_URL, SUPABASE_ANON_KEY } from '../db.js';
import { showToast, showConfirm } from '../components/toasts.js';
import { setButtonLoading, cardRow } from '../utils/uiHelpers.js';
import { createModal, openModal, closeModal, removeModal } from '../components/modals.js';
import {
  isOkAdmin,
  OK_APPS,
  FINANCE_MENU_KEYS
} from '../utils/okAccess.js';
import { renderOkShell, initOkShell } from './ok-shell.js';
import { ensureMemberBucketOnWorkTeam } from '../utils/memberBucketHelpers.js';

let allUsers = [];
let teamCountMapCache = {};
let selectedUserId = null;
const OK_ADMIN_SELECT_MODAL_ID = 'okAdminSelectModal';

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
  const roles = ORG_ROLE_FILTERS.map(r => r.value);
  if (current && !roles.includes(current)) roles.unshift(current);
  return roles.map(r => {
    const matched = ORG_ROLE_FILTERS.find(f => f.value === r);
    const label = matched ? matched.label : r.toUpperCase();
    const sel = r === current ? ' selected' : '';
    return `<option value="${r}"${sel}>${label}</option>`;
  }).join('');
}





export function getOkAdminPage() {
  if (!isOkAdmin()) {
    return renderOkShell({
      activePath: '/admin',
      title: 'Admin',
      bottomTab: 'admin',
      mainHtml: `
        <h1 class="page-title">One Kailasa Admin</h1>
        <div class="card"><p class="empty-state">Only One Kailasa administrators can open this screen.</p></div>
      `
    });
  }

  const defaultTab = window.okAdminDefaultTab || 'users';

  return renderOkShell({
    activePath: '/admin',
    title: 'Admin',
    bottomTab: 'admin',
    mainHtml: `
      <!-- Main Tab Headers -->
      <div class="ok-admin-main-tabs" style="display:flex; gap:16px; margin-bottom:20px; border-bottom:2px solid var(--border); padding-bottom:4px;">
        <button id="okAdminTabUsers" onclick="window.switchOkAdminMainTab('users')" class="tab-btn${defaultTab === 'users' ? ' active' : ''}" style="font-weight:600; font-size:1.05rem; padding:8px 16px; border:none; background:none; color:var(--text); cursor:pointer; border-bottom:3px solid ${defaultTab === 'users' ? 'var(--primary)' : 'transparent'}; opacity:${defaultTab === 'users' ? '1' : '0.7'};">Users</button>
        <button id="okAdminTabTeams" onclick="window.switchOkAdminMainTab('teams')" class="tab-btn${defaultTab === 'teams' ? ' active' : ''}" style="font-weight:600; font-size:1.05rem; padding:8px 16px; border:none; background:none; color:var(--text); cursor:pointer; border-bottom:3px solid ${defaultTab === 'teams' ? 'var(--primary)' : 'transparent'}; opacity:${defaultTab === 'teams' ? '1' : '0.7'};">Teams</button>
      </div>

      <!-- Main Tab Contents: Users -->
      <div id="okAdminMainContentUsers" style="display: ${defaultTab === 'users' ? 'block' : 'none'};">
        <h1 class="page-title">Users</h1>
        <p class="page-intro">Finance department &amp; One Kailasa: set org roles, manage team rosters, app clearances, and permissions overrides.</p>

        <div class="card">
          <div class="form-grid-row form-grid-row--user-filters">
            <div class="form-group">
              <label>Search</label>
              <input type="text" id="okAdminSearch" placeholder="Name or email" oninput="window.filterOkAdminUsers()">
            </div>
            <div class="form-group">
              <label>Status</label>
              <select id="okAdminStatusFilter" onchange="window.filterOkAdminUsers()">
                <option value="active">Active</option>
                <option value="hold">On hold</option>
                <option value="all">All</option>
              </select>
            </div>
            <div class="form-group">
              <label>Org role</label>
              <select id="okAdminRoleFilter" onchange="window.filterOkAdminUsers()">
                ${orgRoleFilterOptions()}
              </select>
            </div>
            <div class="form-group user-mgmt-filter-actions">
              <label>&nbsp;</label>
              <div class="btn-group">
                <button type="button" onclick="window.filterOkAdminUsers()">Search</button>
                <button type="button" class="success" id="okAdminNewBtn">+ New person</button>
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
              <tbody id="okAdminTableBody">
                <tr><td colspan="6" class="empty-state">Loading…</td></tr>
              </tbody>
            </table>
          </div>
          <div id="okAdminMobile" class="show-mobile data-card-list"></div>
        </div>
      </div>

      <!-- Main Tab Contents: Teams -->
      <div id="okAdminMainContentTeams" style="display: ${defaultTab === 'teams' ? 'block' : 'none'};">
        <div id="okAdminTeamsInner">
          <p class="empty-state">Loading Teams management...</p>
        </div>
      </div>

      <div id="okAdminCreateModal" class="modal">
        <div class="modal-content" style="max-width: 500px; padding: 24px 30px !important;">
          <style>
            #okAdminCreateModal .modal-content {
              padding: 24px 30px !important;
            }
            .form-horizontal-row {
              display: flex !important;
              align-items: center;
              gap: 10px;
              width: 100%;
              margin-bottom: 10px !important;
            }
            #okAdminCreateModal .form-horizontal-row input,
            #okAdminCreateModal .form-horizontal-row select {
              font-size: 0.85em !important;
              padding: 6px 8px !important;
              min-height: 32px !important;
            }
            @media (max-width: 480px) {
              .form-horizontal-row {
                flex-direction: column !important;
                align-items: flex-start !important;
                gap: 4px !important;
              }
              .form-horizontal-row label, .form-horizontal-row span {
                text-align: left !important;
                width: 100% !important;
              }
            }
          </style>
          <form id="okAdminCreateForm">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border); padding-bottom:10px; margin-bottom:15px;">
              <h2 style="margin:0;">Add User</h2>
              <div style="display:flex; gap:10px;">
                <button type="submit" id="okCreateSubmit" style="background:#2D6A4F; color:white; border:none; padding:8px 16px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:1.1em; display:flex; align-items:center; justify-content:center;" title="Create">✔</button>
                <button type="button" id="okAdminCreateCancel" style="background:#9B2226; color:white; border:none; padding:8px 16px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:1.1em; display:flex; align-items:center; justify-content:center;" title="Cancel">✖</button>
              </div>
            </div>

            <div class="form-stack-horizontal" style="display:flex; flex-direction:column; gap:4px;">
              <div class="form-group form-horizontal-row">
                <label for="okCreateName" style="width:140px; margin-bottom:0; font-weight:600; text-align:right; flex-shrink:0;">Name:</label>
                <input type="text" id="okCreateName" required autocomplete="name" style="flex:1;">
              </div>
              <div class="form-group form-horizontal-row">
                <label for="okCreateEmail" style="width:140px; margin-bottom:0; font-weight:600; text-align:right; flex-shrink:0;">Email:</label>
                <input type="email" id="okCreateEmail" required autocomplete="email" style="flex:1;">
              </div>
              <div class="form-group form-horizontal-row">
                <label for="okCreatePassword" style="width:140px; margin-bottom:0; font-weight:600; text-align:right; flex-shrink:0; display:flex; align-items:center; justify-content:flex-end; gap:4px; font-size:0.85em;">
                  Password: 
                  <span style="cursor:pointer; color:var(--primary); font-size:1.2em; font-weight:bold;" onclick="window.showPasswordInfo()" title="Password Requirements">ⓘ</span>
                </label>
                <input type="password" id="okCreatePassword" required minlength="8" autocomplete="new-password" style="flex:1;">
              </div>
              <div class="form-group form-horizontal-row">
                <label for="okCreateRetypePassword" style="width:140px; margin-bottom:0; font-weight:600; text-align:right; flex-shrink:0; font-size:0.85em;">Confirm Password:</label>
                <input type="password" id="okCreateRetypePassword" required minlength="8" autocomplete="new-password" style="flex:1;">
              </div>
              <div class="form-group form-horizontal-row">
                <span style="width:140px; font-weight:600; text-align:right; flex-shrink:0; font-size:0.85em;">Gender:</span>
                <div style="display:flex; gap:15px; align-items:center;">
                  <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-weight:600; color:var(--text);"><input type="radio" name="okCreateGender" value="male" required> Male</label>
                  <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-weight:600; color:var(--text);"><input type="radio" name="okCreateGender" value="female" required> Female</label>
                </div>
              </div>
              <div class="form-group form-horizontal-row">
                <label for="okCreateTeamSearch" style="width:140px; margin-bottom:0; font-weight:600; text-align:right; flex-shrink:0; font-size:0.85em;">Search Team:</label>
                <input type="text" id="okCreateTeamSearch" placeholder="Type to filter teams..." oninput="window.filterCreateTeamOptions()" style="flex:1;">
              </div>
              <div class="form-group form-horizontal-row">
                <label for="okCreateTeam" style="width:140px; margin-bottom:0; font-weight:600; text-align:right; flex-shrink:0; font-size:0.85em;">Select Team:</label>
                <select id="okCreateTeam" required style="flex:1;">
                  <option value="">Choose team...</option>
                </select>
              </div>
              <div class="form-group form-horizontal-row">
                <label for="okCreateAccessLevel" style="width:140px; margin-bottom:0; font-weight:600; text-align:right; flex-shrink:0; font-size:0.85em;">Access Level:</label>
                <select id="okCreateAccessLevel" required style="flex:1;">
                  <option value="member">Member (OPS)</option>
                  <option value="lead">Team lead (OPL)</option>
                  <option value="oht">Operations head (OPH)</option>
                  <option value="view">View only</option>
                  <option value="admin">Team admin</option>
                </select>
              </div>
            </div>
          </form>
        </div>
      </div>
    `
  });
}

export function initOkAdminPage() {
  initOkShell();
  if (!isOkAdmin()) return;

  window.filterOkAdminUsers = filterOkAdminUsers;
  window.selectOkAdminUser = selectUser;
  window.closeUserSelectModal = closeUserSelectModal;
  window.wireUserSelectModal = wireUserSelectModal;
  window.switchOkAdminMainTab = switchOkAdminMainTab;
  window.saveActiveOkAdminTab = saveActiveOkAdminTab;
  window.showPasswordInfo = showPasswordInfo;
  setupCreateModal();
  
  const defaultTab = window.okAdminDefaultTab || 'users';
  if (defaultTab === 'teams') {
    switchOkAdminMainTab('teams');
  } else {
    loadUsers();
  }
}

function showPasswordInfo() {
  showToast('Minimum 8 characters, 1 Capital Letter, 1 number, 1 special character !@$-. Cannot contain name parts, nithya, 123, ananda, swamiji, kailasa, shiva, or paramashiva.', 'info');
}

async function saveActiveOkAdminTab() {
  const activeTab = document.querySelector('.tabs-container .tab-btn.active');
  if (!activeTab) return;
  const id = activeTab.id;
  if (id === 'btnTabProfile') {
    const form = document.getElementById('okProfileForm');
    if (form) {
      form.requestSubmit();
    }
  } else if (id === 'btnTabAppaccess' || id === 'btnTabChat') {
    await saveAccess(selectedUserId);
  } else if (id === 'btnTabTeams') {
    showToast('Team changes are saved automatically.', 'info');
  } else if (id === 'btnTabPermissions') {
    showToast('Administrative status changes are applied immediately.', 'info');
  }
}

async function switchOkAdminMainTab(tabName) {
  window.okAdminDefaultTab = tabName;
  const usersTab = document.getElementById('okAdminTabUsers');
  const teamsTab = document.getElementById('okAdminTabTeams');
  const usersContent = document.getElementById('okAdminMainContentUsers');
  const teamsContent = document.getElementById('okAdminMainContentTeams');
  
  if (usersTab && teamsTab && usersContent && teamsContent) {
    if (tabName === 'users') {
      usersTab.style.borderBottom = '3px solid var(--primary)';
      usersTab.style.opacity = '1';
      teamsTab.style.borderBottom = '3px solid transparent';
      teamsTab.style.opacity = '0.7';
      usersContent.style.display = 'block';
      teamsContent.style.display = 'none';
      await loadUsers();
    } else {
      teamsTab.style.borderBottom = '3px solid var(--primary)';
      teamsTab.style.opacity = '1';
      usersTab.style.borderBottom = '3px solid transparent';
      usersTab.style.opacity = '0.7';
      usersContent.style.display = 'none';
      teamsContent.style.display = 'block';
      
      const { getTeamMgmtPage, initTeamMgmtPage } = await import('./team-mgmt.js');
      const inner = document.getElementById('okAdminTeamsInner');
      if (inner) {
        inner.innerHTML = getTeamMgmtPage();
        await initTeamMgmtPage();
      }
    }
  }
}

function wireUserSelectModal() {
  const modal = document.getElementById(OK_ADMIN_SELECT_MODAL_ID);
  if (!modal) return;
  const closeBtn = modal.querySelector('.close-modal');
  if (closeBtn) closeBtn.onclick = () => closeUserSelectModal();
  // modal.onclick = (e) => {
  //   if (e.target === modal) closeUserSelectModal();
  // };
}

function closeUserSelectModal() {
  selectedUserId = null;
  closeModal(OK_ADMIN_SELECT_MODAL_ID);
}

async function loadUsers() {
  const tbody = document.getElementById('okAdminTableBody');
  const mobile = document.getElementById('okAdminMobile');

  if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Loading…</td></tr>';
  if (mobile) mobile.innerHTML = '<p class="empty-state">Loading…</p>';

  try {
    const [usersRes, userTeamsRes] = await Promise.all([
      supabaseClient.from('users').select('id, email, name, role, on_hold, gender, clearance_level, escalation_tokens').order('name'),
      supabaseClient.from('user_teams').select('user_id, team_id, teams:team_id(name, is_personal_team)')
    ]);

    if (usersRes.error) throw usersRes.error;

    teamCountMapCache = {};
    window.allUserTeams = userTeamsRes.data || [];
    (userTeamsRes.data || []).forEach(m => {
      if (m.teams?.is_personal_team) return;
      teamCountMapCache[m.user_id] = (teamCountMapCache[m.user_id] || 0) + 1;
    });

    allUsers = usersRes.data || [];
    filterOkAdminUsers();
  } catch (err) {
    showToast(err.message || 'Could not load users', 'error');
  }
}

function filterOkAdminUsers() {
  const q = (document.getElementById('okAdminSearch')?.value || '').trim().toLowerCase();
  const statusFilter = document.getElementById('okAdminStatusFilter')?.value || 'active';
  const roleFilter = (document.getElementById('okAdminRoleFilter')?.value || '').toLowerCase();

  const tbody = document.getElementById('okAdminTableBody');
  const mobile = document.getElementById('okAdminMobile');

  const filtered = allUsers.filter(u => {
    if (statusFilter === 'active' && u.on_hold) return false;
    if (statusFilter === 'hold' && !u.on_hold) return false;
    if (roleFilter && String(u.role || 'user').toLowerCase() !== roleFilter) return false;
    if (!q) return true;
    return (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
  });

  if (!filtered.length) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No users match these filters.</td></tr>';
    if (mobile) mobile.innerHTML = '<p class="empty-state">No users match these filters.</p>';
    return;
  }

  if (tbody) {
    tbody.innerHTML = filtered.map(u => {
      const statusBadge = u.on_hold
        ? '<span class="badge badge-danger">On hold</span>'
        : '<span class="badge badge-success">Active</span>';
      const teams = teamCountMapCache[u.id] || 0;
      const teamsLabel = teams === 1 ? '1 work team' : `${teams} work teams`;
      const matched = ORG_ROLE_FILTERS.find(f => f.value === u.role);
      const displayRole = matched ? matched.label.split(' (')[0] : (u.role || 'User').toUpperCase();

      return `
        <tr class="${u.id === selectedUserId ? 'row-selected' : ''}">
          <td data-label="Name"><strong>${escapeHtml(u.name || '—')}</strong></td>
          <td data-label="Email">${escapeHtml(u.email || '')}</td>
          <td data-label="Org role">${escapeHtml(displayRole)}</td>
          <td data-label="Teams">${teamsLabel}</td>
          <td data-label="Status">${statusBadge}</td>
          <td data-label="">
            <button type="button" class="small secondary" onclick="window.selectOkAdminUser('${u.id}')">Select</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  if (mobile) {
    mobile.innerHTML = filtered.map(u => {
      const statusBadge = u.on_hold
        ? '<span class="badge badge-danger">On hold</span>'
        : '<span class="badge badge-success">Active</span>';
      const teams = teamCountMapCache[u.id] || 0;
      const teamsLabel = teams === 1 ? '1 work team' : `${teams} work teams`;
      const matched = ORG_ROLE_FILTERS.find(f => f.value === u.role);
      const displayRole = matched ? matched.label : (u.role || 'User').toUpperCase();

      return `
        <article class="data-card data-card--compact ${u.id === selectedUserId ? 'data-card--selected' : ''}">
          <div class="data-card-top">
            <span class="data-card-title">${escapeHtml(u.name || '—')}</span>
            ${statusBadge}
          </div>
          ${cardRow('Email', u.email || '—')}
          ${cardRow('Org role', displayRole)}
          ${cardRow('Work teams', teamsLabel)}
          <div class="btn-group" style="margin-top:10px;">
            <button type="button" class="small secondary" onclick="window.selectOkAdminUser('${u.id}')">Select</button>
          </div>
        </article>
      `;
    }).join('');
  }
}

async function selectUser(userId) {
  selectedUserId = userId;
  filterOkAdminUsers();
  const user = allUsers.find(u => u.id === userId);
  if (!user) return;

  removeModal(OK_ADMIN_SELECT_MODAL_ID);
  createModal(OK_ADMIN_SELECT_MODAL_ID, '<p class="empty-state">Loading user details and memberships…</p>', { maxWidth: '720px' });
  wireUserSelectModal();
  openModal(OK_ADMIN_SELECT_MODAL_ID);

  try {
    const [
      adminRes,
      userTeamsRes,
      chatPermRes,
      allTeamsRes,
      assignmentsRes
    ] = await Promise.all([
      supabaseClient.from('ok_admins').select('user_id').eq('user_id', userId).maybeSingle(),
      supabaseClient.from('user_teams').select('id, team_id, access_level, teams:team_id(id, name, is_personal_team)').eq('user_id', userId),
      supabaseClient.from('chat_permissions').select('*').eq('user_id', userId).maybeSingle(),
      supabaseClient.from('teams').select('id, name, gender_scope').eq('is_personal_team', false).order('name'),
      supabaseClient.from('request_role_assignments').select('role_code, team_id, request_type, teams:team_id(name)').eq('user_id', userId).eq('is_active', true).order('role_code')
    ]);

    const isAdmin = !!adminRes.data;

    const isGlobalAdmin = !!state.isOkAdmin;
    const managedApps = state.okAppAdmins || [];

    const memberships = (userTeamsRes.data || []).filter(m => !m.teams?.is_personal_team);
    const joinedTeamIds = new Set(memberships.map(m => m.team_id));
    const availableTeams = (allTeamsRes.data || []).filter(t => !joinedTeamIds.has(t.id));

    const chatPerm = chatPermRes.data || {};
    const allowOpposite = !!chatPerm.allow_opposite_gender;
    const crossTeam = chatPerm.cross_team_access || 'none';
    const allowedUsersList = chatPerm.allowed_users || [];
    const allowedRolesList = chatPerm.allowed_roles || [];
    const allowedTeamsList = chatPerm.allowed_teams || [];
    const assignments = assignmentsRes.data || [];

    // Allow whitelisting from all other active users
    const oppositeGenderUsers = allUsers.filter(u => u.id !== userId && !u.on_hold);

    const statusBadge = user.on_hold
      ? '<span class="badge badge-danger">On hold</span>'
      : '<span class="badge badge-success">Active</span>';

    // Store whitelisted user set globally on window for dynamic checkbox access
    window.currentAllowedUsers = new Set(allowedUsersList);
    window.oppositeGenderUsers = oppositeGenderUsers;
    window.availableTeamsCache = availableTeams;

    const content = `
      <div class="user-select-modal" style="padding:0;">
        <div class="modal-header-band" style="position: sticky; top: -24px; margin-top: -24px; padding-top: 24px; background: var(--modal-bg, var(--card-bg)); z-index: 100; border-bottom: 1px solid var(--border); padding-bottom: 10px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; gap: 10px; width: 100%;">
          <div style="display:flex; flex-direction:column; gap:2px;">
            <h2 style="margin:0; font-size:1.3em; color: var(--text);">${escapeHtml(user.name || '—')}</h2>
            <p class="user-select-email" style="margin:0; color: var(--text-secondary); font-size: 0.85em;">${escapeHtml(user.email || '')}</p>
          </div>
          <div class="btn-group" style="gap: 8px; align-items: center;">
            <button type="button" id="okHeaderSaveBtn" onclick="window.saveActiveOkAdminTab()" style="background:#2D6A4F; color:white; border:none; padding:8px 16px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:1.1em; display:flex; align-items:center; justify-content:center;" title="Save">✔</button>
            <button type="button" id="okHeaderCancelBtn" onclick="window.closeUserSelectModal()" style="background:#9B2226; color:white; border:none; padding:8px 16px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:1.1em; display:flex; align-items:center; justify-content:center;" title="Cancel">✖</button>
          </div>
        </div>

        <!-- Tab Buttons -->
        <div class="tabs-container" style="margin-bottom: 20px; display: flex; gap: 6px; border-bottom: 1px solid var(--border); padding-bottom: 10px; flex-wrap: wrap;">
          <button type="button" class="tab-btn active" id="btnTabProfile" onclick="window.switchOkAdminTab('profile')" style="background: none; border: none; padding: 6px 12px; cursor: pointer; font-size:0.9em; font-weight: bold; border-bottom: 3px solid var(--primary); color: var(--text);">Identity & Roles</button>
          <button type="button" class="tab-btn" id="btnTabTeams" onclick="window.switchOkAdminTab('teams')" style="background: none; border: none; padding: 6px 12px; cursor: pointer; font-size:0.9em; color: var(--text-secondary);">Teams</button>
          <button type="button" class="tab-btn" id="btnTabAppaccess" onclick="window.switchOkAdminTab('appaccess')" style="background: none; border: none; padding: 6px 12px; cursor: pointer; font-size:0.9em; color: var(--text-secondary);">App Access</button>
          <button type="button" class="tab-btn" id="btnTabChat" onclick="window.switchOkAdminTab('chat')" style="background: none; border: none; padding: 6px 12px; cursor: pointer; font-size:0.9em; color: var(--text-secondary);">Konnect</button>
          <button type="button" class="tab-btn" id="btnTabPermissions" onclick="window.switchOkAdminTab('permissions')" style="background: none; border: none; padding: 6px 12px; cursor: pointer; font-size:0.9em; color: var(--text-secondary);">Permissions</button>
        </div>

        <!-- TAB 1: Identity & Roles -->
        <div id="tabContentProfile" class="ok-admin-tab-content" style="display: block;">
          <form id="okProfileForm" onsubmit="window.saveUserProfileInline(event)">
            <div class="form-grid" style="margin-bottom:16px;">
              <div class="form-group">
                <label for="okSelectName">Full Name *</label>
                <input type="text" id="okSelectName" required maxlength="120" value="${escapeHtml(user.name || '')}">
              </div>
              <div class="form-group">
                <label for="okSelectRole">Global Role</label>
                <select id="okSelectRole" class="form-control" ${isGlobalAdmin ? '' : 'disabled'}>
                  ${roleOptions(user.role || 'user')}
                </select>
              </div>
              <div class="form-group">
                <label for="okSelectGender">Gender</label>
                <select id="okSelectGender" class="form-control" ${isGlobalAdmin ? '' : 'disabled'}>
                  <option value="male" ${user.gender === 'male' ? 'selected' : ''}>Male</option>
                  <option value="female" ${user.gender === 'female' ? 'selected' : ''}>Female</option>
                </select>
              </div>
              <div class="form-group">
                <label for="okSelectTokens">Escalation Tokens</label>
                <select id="okSelectTokens" class="form-control" ${isGlobalAdmin ? '' : 'disabled'}>
                  <option value="1" ${user.escalation_tokens === 1 ? 'selected' : ''}>1</option>
                  <option value="2" ${user.escalation_tokens === 2 ? 'selected' : ''}>2</option>
                  <option value="3" ${user.escalation_tokens === 3 || user.escalation_tokens === undefined || user.escalation_tokens === null ? 'selected' : ''}>3 (Default)</option>
                </select>
              </div>
            </div>
            <div class="btn-group">
              <button type="submit" id="okSaveProfileBtn">Save Profile</button>
              <button type="button" class="secondary" id="okResetPwdBtn">Send Password Reset Email</button>
            </div>
          </form>
        </div>

        <!-- TAB 2: Teams -->
        <div id="tabContentTeams" class="ok-admin-tab-content" style="display: none;">
          <h3>Work Teams</h3>
          <div class="table-container show-desktop">
            <table class="user-select-table">
              <thead>
                <tr>
                  <th>Team Name</th>
                  <th>Access Level</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${memberships.length === 0 
                  ? '<tr><td colspan="3" class="empty-state">No team memberships found.</td></tr>' 
                  : memberships.map(m => `
                    <tr>
                      <td><strong>${escapeHtml(m.teams?.name)}</strong></td>
                      <td>
                        <select onchange="window.updateTeamAccessInline('${m.team_id}', this.value)" style="padding:4px; border-radius:4px; border:1px solid var(--border); font-size:0.9em; background:var(--card-bg); color:var(--text);">
                          <option value="view" ${m.access_level === 'view' ? 'selected' : ''}>View only</option>
                          <option value="member" ${m.access_level === 'member' ? 'selected' : ''}>Member (OPS)</option>
                          <option value="lead" ${m.access_level === 'lead' ? 'selected' : ''}>Team lead (OPL)</option>
                          <option value="oht" ${m.access_level === 'oht' ? 'selected' : ''}>Operations head (OPH)</option>
                          <option value="admin" ${m.access_level === 'admin' ? 'selected' : ''}>Team admin</option>
                        </select>
                      </td>
                      <td>
                        <button type="button" class="danger small" onclick="window.removeTeamMemberInline('${m.team_id}')">Remove</button>
                      </td>
                    </tr>
                  `).join('')}
              </tbody>
            </table>
          </div>
          <div class="show-mobile data-card-list">
            ${memberships.length === 0 
              ? '<p class="empty-state">No team memberships found.</p>' 
              : memberships.map(m => `
                <article class="data-card data-card--compact">
                  <div class="data-card-top">
                    <span class="data-card-title">${escapeHtml(m.teams?.name)}</span>
                    <button type="button" class="danger small" onclick="window.removeTeamMemberInline('${m.team_id}')">Remove</button>
                  </div>
                  <div class="form-group" style="margin-top:8px;">
                    <label>Access Level</label>
                    <select onchange="window.updateTeamAccessInline('${m.team_id}', this.value)" style="width:100%; padding:6px; border-radius:6px; border:1px solid var(--border); background:var(--card-bg); color:var(--text);">
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

          <h4 style="margin-top:24px;">Add to a Team</h4>
          <form id="okAddUserTeamForm" onsubmit="window.addTeamMemberInline(event)" style="background:var(--bg-secondary); padding:16px; border-radius:8px; border:1px solid var(--border); margin-bottom: 20px;">
            <div class="form-group" style="margin-bottom:12px; display:flex; gap:10px;">
              <div style="flex:1;">
                <label for="okAddTeamSearch">Filter Teams</label>
                <input type="text" id="okAddTeamSearch" placeholder="Type to filter teams list below..." oninput="window.filterOkAddTeamOptions()" style="width:100%; height:34px; padding:6px; border-radius:6px; border:1px solid var(--border); background:var(--card-bg); color:var(--text);">
              </div>
              <div style="width:140px;">
                <label for="okAddTeamGenderScopeFilter">Gender Scope</label>
                <select id="okAddTeamGenderScopeFilter" onchange="window.filterOkAddTeamOptions()" style="width:100%; height:34px; border-radius:6px; border:1px solid var(--border); padding:6px; background:var(--card-bg); color:var(--text);">
                  <option value="">All Scopes</option>
                  <option value="mixed">Mixed</option>
                  <option value="male">Male only</option>
                  <option value="female">Female only</option>
                </select>
              </div>
            </div>
            <div class="form-grid" style="align-items:flex-end; gap:16px; margin-bottom:12px;">
              <div class="form-group">
                <label for="okAddTeamSelect">Select Team</label>
                <select id="okAddTeamSelect" required style="width:100%;">
                  <option value="">Choose team…</option>
                  ${availableTeams.map(t => `<option value="${t.id}">${escapeHtml(t.name)} (${escapeHtml(t.gender_scope || 'mixed')})</option>`).join('')}
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
          ${buildApprovalRolesSection(assignments)}
        </div>

        <!-- TAB 3: App Access -->
        <div id="tabContentAppaccess" class="ok-admin-tab-content" style="display: none;">
          <h3>App & Menu Access</h3>
          
          <div style="margin-bottom: 16px;">
            <label for="okAppAccessTeamSelect" style="font-weight:600; display:block; margin-bottom:6px; color: var(--text);">Select Team to Configure App Access</label>
            <select id="okAppAccessTeamSelect" onchange="window.onAppAccessTeamChange(this.value)" style="width:100%; height:36px; border-radius:6px; border:1px solid var(--border); padding:6px; background:var(--card-bg); color:var(--text);">
              ${memberships.map(m => `<option value="${m.team_id}">${escapeHtml(m.teams?.name)}</option>`).join('')}
              ${memberships.length === 0 ? '<option value="">No teams assigned (please assign under Teams tab first)</option>' : ''}
            </select>
          </div>

          <h4 style="margin:12px 0 6px;">Applications</h4>
          <div class="ok-access-checks" id="okAppChecks" style="margin-bottom:16px; display: flex; flex-wrap: wrap; gap: 10px;">
            ${OK_APPS.map(a => {
              const canManage = isGlobalAdmin || managedApps.includes(a.code);
              const disabled = canManage ? '' : 'disabled';
              return `
                <label class="ok-pin-check" style="${canManage ? '' : 'opacity: 0.6; pointer-events: none;'} cursor: pointer; display: flex; align-items: center; gap: 6px;">
                  <input type="checkbox" data-app="${a.code}" ${disabled}>
                  ${escapeHtml(a.label)}${a.live ? '' : ' (soon)'}
                </label>
              `;
            }).join('')}
          </div>

          <!-- Conditional App Menu Selection -->
          <div style="margin-top:16px; margin-bottom:16px;">
            <label for="okAppMenuConfigureSelect" style="font-weight:600; display:block; margin-bottom:6px; color: var(--text);">Configure App Menus</label>
            <select id="okAppMenuConfigureSelect" onchange="window.switchAppMenuConfig(this.value)" style="width:100%; height:36px; border-radius:6px; border:1px solid var(--border); padding:6px; background:var(--card-bg); color:var(--text);">
              <option value="none">Choose app to configure menus…</option>
              <option value="finance">Finance</option>
              <option value="gurukul">Gurukul</option>
              <option value="utilities">Utilities</option>
              <option value="tasks">Tasks</option>
              <option value="konnect">Konnect</option>
            </select>
          </div>

          <!-- Finance Menus Config Panel -->
          <div id="okMenuConfigFinance" class="ok-menu-config-panel" style="display:none; border:1px solid var(--border); border-radius:6px; padding:12px; background:var(--bg-secondary); margin-bottom:16px;">
            <h4 style="margin:0 0 10px; color: var(--text);">Finance Menu Permissions</h4>
            <div class="ok-access-checks ok-access-checks--menus" id="okMenuChecks" style="max-height:200px; overflow-y:auto; display:flex; flex-direction:column; gap:6px;">
              ${FINANCE_MENU_KEYS.map(m => `
                <label style="cursor:pointer; display:flex; align-items:center; gap:8px; color: var(--text-secondary); font-size: 0.9em;">
                  <input type="checkbox" data-menu="${m.key}">
                  ${escapeHtml(m.label)}
                </label>
              `).join('')}
            </div>
          </div>

          <!-- Gurukul Menus Config Panel -->
          <div id="okMenuConfigGurukul" class="ok-menu-config-panel" style="display:none; border:1px solid var(--border); border-radius:6px; padding:12px; background:var(--bg-secondary); margin-bottom:16px;">
            <p class="empty-state" style="font-size:0.85em; margin:0; color: var(--text-secondary);">Gurukul menus will be configurable once the module is live.</p>
          </div>

          <!-- Generic Config Panel -->
          <div id="okMenuConfigGeneric" class="ok-menu-config-panel" style="display:none; border:1px solid var(--border); border-radius:6px; padding:12px; background:var(--bg-secondary); margin-bottom:16px;">
            <p class="empty-state" style="font-size:0.85em; margin:0; color: var(--text-secondary);">No custom menus to configure for this app.</p>
          </div>

          <div class="btn-group" style="margin-top:24px;">
            <button type="button" class="success save-access-btn" id="okSaveAccess">Save Permissions</button>
          </div>
        </div>

        <!-- TAB 4: Chat Clearances -->
        <div id="tabContentChat" class="ok-admin-tab-content" style="display: none;">
          <h3>Konnect Messaging Clearances</h3>
          <div class="form-grid" style="margin-bottom:16px;">
            <div class="form-group" style="display:flex; align-items:center; gap:8px;">
              <input type="checkbox" id="okAllowOpposite" ${allowOpposite ? 'checked' : ''} style="cursor:pointer; width:16px; height:16px;">
              <label for="okAllowOpposite" style="cursor:pointer; font-weight:600; margin:0; user-select:none; color: var(--text);">Allow opposite gender messaging</label>
            </div>
            <div class="form-group">
              <label for="okCrossTeam" style="color: var(--text);">Cross-team clearance</label>
              <select id="okCrossTeam" style="width:100%; height:36px; border-radius:6px; border:1px solid var(--border); padding:6px; background:var(--card-bg); color:var(--text);">
                <option value="none" ${crossTeam === 'none' ? 'selected' : ''}>None (Shared teams only)</option>
                <option value="team" ${crossTeam === 'team' ? 'selected' : ''}>Team (All team channels visible)</option>
                <option value="global" ${crossTeam === 'global' ? 'selected' : ''}>Global (All users visible)</option>
              </select>
            </div>
          </div>

          <!-- Role Clearances Override -->
          <hr style="border: 0; border-top: 1px solid var(--border); margin: 20px 0;">
          <h4 style="margin:12px 0 6px; color: var(--text);">Explicit Role Permissions</h4>
          <p class="section-hint" style="margin-bottom:8px;">Grant this user permission to message anyone with these roles, regardless of gender or team limits.</p>
          <div id="okAllowedRolesList" style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:16px;">
            <label style="cursor:pointer; display: flex; align-items: center; gap: 4px; color: var(--text-secondary);"><input type="checkbox" data-role-clearance="fin" ${allowedRolesList.includes('fin') ? 'checked' : ''}> FIN</label>
            <label style="cursor:pointer; display: flex; align-items: center; gap: 4px; color: var(--text-secondary);"><input type="checkbox" data-role-clearance="fip" ${allowedRolesList.includes('fip') ? 'checked' : ''}> FIP</label>
            <label style="cursor:pointer; display: flex; align-items: center; gap: 4px; color: var(--text-secondary);"><input type="checkbox" data-role-clearance="oh" ${allowedRolesList.includes('oh') ? 'checked' : ''}> OH (FIH)</label>
            <label style="cursor:pointer; display: flex; align-items: center; gap: 4px; color: var(--text-secondary);"><input type="checkbox" data-role-clearance="caoh" ${allowedRolesList.includes('caoh') ? 'checked' : ''}> CAOH (CAO)</label>
            <label style="cursor:pointer; display: flex; align-items: center; gap: 4px; color: var(--text-secondary);"><input type="checkbox" data-role-clearance="ceo" ${allowedRolesList.includes('ceo') ? 'checked' : ''}> CEO</label>
            <label style="cursor:pointer; display: flex; align-items: center; gap: 4px; color: var(--text-secondary);"><input type="checkbox" data-role-clearance="admin" ${allowedRolesList.includes('admin') ? 'checked' : ''}> Admin</label>
          </div>

          <!-- Team Clearances Override with Search -->
          <hr style="border: 0; border-top: 1px solid var(--border); margin: 20px 0;">
          <h4 style="margin:12px 0 6px; color: var(--text);">Explicit Team Permissions</h4>
          <p class="section-hint" style="margin-bottom:8px;">Grant this user permission to message anyone belonging to these teams, regardless of gender limits.</p>
          
          <input type="text" id="okTeamClearanceSearch" placeholder="Search teams to whitelist..." oninput="window.filterExplicitTeamsClearance()" style="width:100%; margin-bottom:8px; height:34px; padding:6px; border-radius:6px; border:1px solid var(--border); background:var(--card-bg); color:var(--text);">
          
          <div style="margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
            <label style="font-size:0.85em; font-weight:600; cursor:pointer; color:var(--text); display: flex; align-items: center; gap: 4px;">
              <input type="checkbox" id="okSelectAllTeamsClearance" onchange="window.toggleSelectAllTeamsClearance(this.checked)"> Select All Matching
            </label>
            <span id="okTeamClearanceCount" style="font-size:0.8em; color:var(--text-secondary);">0 matched</span>
          </div>

          <div id="okAllowedTeamsList" style="max-height:120px; overflow-y:auto; border:1px solid var(--border); border-radius:6px; padding:8px; display:flex; flex-direction:column; gap:6px; background:var(--bg-secondary); margin-bottom:16px;">
            ${allTeamsRes.data?.map(t => {
              const isChecked = allowedTeamsList.includes(t.id);
              return `<label style="cursor:pointer; display:flex; align-items:center; gap:6px; color: var(--text-secondary); font-size: 0.95em;"><input type="checkbox" data-team-clearance="${t.id}" ${isChecked ? 'checked' : ''}> ${escapeHtml(t.name)}</label>`;
            }).join('')}
          </div>

          <!-- Opposite Gender Bulk Filter Checkbox List -->
          <hr style="border: 0; border-top: 1px solid var(--border); margin: 20px 0;">
          <h4 style="margin:12px 0 6px; color: var(--text);">Explicit Individual Clearances</h4>
          <p class="section-hint" style="margin-bottom:12px;">Search and whitelist specific individuals (e.g. opposite-gender) for direct chat override.</p>
          
          <div class="form-grid-row" style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:12px;">
            <input type="text" id="okOppositeSearch" placeholder="Search name/email..." oninput="window.filterOppositeGenderUsers()" style="flex:1; min-width: 180px; height:36px; padding:6px; border:1px solid var(--border); border-radius:6px; background:var(--card-bg); color:var(--text);">
            <select id="okOppositeRoleFilter" onchange="window.filterOppositeGenderUsers()" style="width:120px; height:36px; border-radius:6px; border:1px solid var(--border); padding:6px; background:var(--card-bg); color:var(--text);">
              <option value="">All Roles</option>
              <option value="user">User</option>
              <option value="fin">FIN</option>
              <option value="fip">FIP</option>
              <option value="oh">OH</option>
              <option value="caoh">CAOH</option>
              <option value="ceo">CEO</option>
              <option value="admin">Admin</option>
            </select>
            <select id="okOppositeGenderFilter" onchange="window.filterOppositeGenderUsers()" style="width:120px; height:36px; border-radius:6px; border:1px solid var(--border); padding:6px; background:var(--card-bg); color:var(--text);">
              <option value="">All Genders</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
            <select id="okOppositeTeamFilter" onchange="window.filterOppositeGenderUsers()" style="flex:1; min-width:180px; height:36px; border-radius:6px; border:1px solid var(--border); padding:6px; background:var(--card-bg); color:var(--text);">
              <option value="">All Teams</option>
              ${(allTeamsRes.data || []).map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')}
            </select>
          </div>

          <div style="margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
            <label style="font-size:0.85em; font-weight:600; cursor:pointer; color:var(--text); display: flex; align-items: center; gap: 4px;">
              <input type="checkbox" id="okSelectAllOpposite" onchange="window.toggleSelectAllOpposite(this.checked)"> Select All Matching
            </label>
            <span id="okOppositeCount" style="font-size:0.8em; color:var(--text-secondary);">0 matched</span>
          </div>

          <div id="okOppositeList" style="max-height:150px; overflow-y:auto; border:1px solid var(--border); border-radius:6px; padding:8px; background:var(--bg-secondary); display:flex; flex-direction:column; gap:6px; margin-bottom:20px;">
            <!-- Loaded dynamically -->
          </div>

          <div class="btn-group">
            <button type="button" class="success save-access-btn" id="okSaveAccess">Save Permissions</button>
          </div>
        </div>

        <!-- TAB 5: Permissions -->
        <div id="tabContentPermissions" class="ok-admin-tab-content" style="display: none;">
          <h3>Administrative Controls</h3>
          <div style="background:var(--bg-secondary); padding:16px; border-radius:8px; border:1px solid var(--border); display:flex; flex-direction:column; gap:16px; margin-bottom: 20px;">
            <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">
              <div>
                <strong style="color:var(--text);">User Status</strong>
                <p style="margin:4px 0 0; font-size:0.9em; color:var(--text-secondary);">Place the user on hold to revoke their access, or activate them.</p>
              </div>
              <div style="display:flex; align-items:center; gap:10px;">
                ${statusBadge}
                <button type="button" class="secondary" id="okToggleHold" ${isOkAdmin() ? '' : 'disabled style="opacity:0.6; pointer-events:none;"'}>
                  ${user.on_hold ? 'Remove hold' : 'Place on hold'}
                </button>
              </div>
            </div>
            
            <hr style="border:0; border-top:1px solid var(--border); margin:0;">
            
            <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">
              <div>
                <strong style="color:var(--text);">Administrator Role</strong>
                <p style="margin:4px 0 0; font-size:0.9em; color:var(--text-secondary);">Grant global One Kailasa Admin access to this user.</p>
              </div>
              <button type="button" class="secondary" id="okToggleAdmin" ${isOkAdmin() ? '' : 'disabled style="opacity:0.6; pointer-events:none;"'}>
                ${isAdmin ? 'Remove OK Admin' : 'Make OK Admin'}
              </button>
            </div>
            
            <hr style="border:0; border-top:1px solid var(--border); margin:0;">
            
            <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">
              <div>
                <strong style="color:var(--text);">Reset Access</strong>
                <p style="margin:4px 0 0; font-size:0.9em; color:var(--text-secondary);">Revert all custom permission overrides and app mappings back to defaults.</p>
              </div>
              <button type="button" class="secondary" id="okResetAccess" ${isOkAdmin() ? '' : 'disabled style="opacity:0.6; pointer-events:none;"'}>
                Reset Access
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    removeModal(OK_ADMIN_SELECT_MODAL_ID);
    createModal(OK_ADMIN_SELECT_MODAL_ID, content, { maxWidth: '720px', hideCloseButton: true });
    wireUserSelectModal();
    openModal(OK_ADMIN_SELECT_MODAL_ID);

    document.getElementById('okToggleHold')?.addEventListener('click', () => toggleHold(user));
    document.getElementById('okToggleAdmin')?.addEventListener('click', () => toggleAdmin(user, isAdmin));
    document.getElementById('okResetAccess')?.addEventListener('click', () => resetAccess(user));
    document.querySelectorAll('.save-access-btn').forEach(btn => {
      btn.addEventListener('click', () => saveAccess(userId));
    });
    document.getElementById('okResetPwdBtn')?.addEventListener('click', () => sendResetEmailInline(user.email));

    // Trigger initial filter load
    window.filterOppositeGenderUsers();
    window.filterExplicitTeamsClearance();
    const firstTeamId = memberships[0]?.team_id;
    if (firstTeamId) {
      await window.onAppAccessTeamChange(firstTeamId);
    }

  } catch (err) {
    console.error('Load details error:', err);
    removeModal(OK_ADMIN_SELECT_MODAL_ID);
    createModal(OK_ADMIN_SELECT_MODAL_ID, `<p class="empty-state" style="color:var(--danger);">Error loading details: ${escapeHtml(err.message)}</p>`, { maxWidth: '720px' });
    wireUserSelectModal();
    openModal(OK_ADMIN_SELECT_MODAL_ID);
  }
}

function buildApprovalRolesSection(assignments) {
  if (!assignments.length) {
    return `<p class="empty-state" style="font-size:0.9em; margin:0; color: var(--text-secondary);">No approval role assignments.</p>`;
  }

  const rows = assignments.map(row => {
    const teamName = row.team_id ? escapeHtml(row.teams?.name || 'Team') : 'Global';
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
  `;
}

// Inline tab switcher
window.switchOkAdminTab = (tabName) => {
  const tabs = ['profile', 'teams', 'appaccess', 'chat', 'permissions'];
  tabs.forEach(t => {
    const tabEl = document.getElementById(`tabContent${t.charAt(0).toUpperCase() + t.slice(1)}`);
    if (tabEl) tabEl.style.display = t === tabName ? 'block' : 'none';
    
    const btnEl = document.getElementById(`btnTab${t.charAt(0).toUpperCase() + t.slice(1)}`);
    if (btnEl) {
      btnEl.classList.remove('active');
      btnEl.style.borderBottom = 'none';
      btnEl.style.color = 'var(--text-secondary)';
      btnEl.style.fontWeight = 'normal';
    }
  });

  const activeBtn = document.getElementById(`btnTab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
  if (activeBtn) {
    activeBtn.classList.add('active');
    activeBtn.style.borderBottom = '3px solid var(--primary)';
    activeBtn.style.color = 'var(--text)';
    activeBtn.style.fontWeight = 'bold';
  }
};

// Filter available teams in Tab 2
window.filterOkAddTeamOptions = () => {
  const q = (document.getElementById('okAddTeamSearch')?.value || '').trim().toLowerCase();
  const genderScopeFilter = document.getElementById('okAddTeamGenderScopeFilter')?.value || '';
  const select = document.getElementById('okAddTeamSelect');
  if (!select) return;
  
  const matched = (window.availableTeamsCache || []).filter(t => {
    const textMatch = t.name.toLowerCase().includes(q);
    const genderScopeMatch = !genderScopeFilter || t.gender_scope === genderScopeFilter;
    return textMatch && genderScopeMatch;
  });
  
  select.innerHTML = '<option value="">Choose team…</option>' +
    matched.map(t => `<option value="${t.id}">${escapeHtml(t.name)} (${escapeHtml(t.gender_scope || 'mixed')})</option>`).join('');
};

window.onAppAccessTeamChange = async (teamId) => {
  if (!teamId) return;
  const select = document.getElementById('okAppAccessTeamSelect');
  if (select) select.disabled = true;

  try {
    const [appsRes, menusRes] = await Promise.all([
      supabaseClient.from('ok_app_access').select('app_code, enabled').eq('user_id', selectedUserId).eq('team_id', teamId),
      supabaseClient.from('ok_menu_access').select('menu_key, enabled').eq('user_id', selectedUserId).eq('team_id', teamId).eq('app_code', 'finance')
    ]);

    const appSet = new Set((appsRes.data || []).filter(a => a.enabled).map(a => a.app_code));
    const menuSet = new Set((menusRes.data || []).filter(m => m.enabled).map(m => m.menu_key));

    // Update app checkboxes
    document.querySelectorAll('#okAppChecks [data-app]').forEach(cb => {
      const appCode = cb.getAttribute('data-app');
      if (appCode === 'tasks' || appCode === 'konnect') {
        const explicitRow = (appsRes.data || []).find(a => a.app_code === appCode);
        cb.checked = explicitRow ? explicitRow.enabled : true;
      } else {
        cb.checked = appSet.has(appCode);
      }
    });

    // Update menu checkboxes
    document.querySelectorAll('#okMenuChecks [data-menu]').forEach(cb => {
      cb.checked = menuSet.has(cb.getAttribute('data-menu'));
    });
  } catch (err) {
    showToast('Failed to load team app access: ' + err.message, 'error');
  } finally {
    if (select) select.disabled = false;
  }
};

// Switch App configuration menus dropdown
window.switchAppMenuConfig = (appCode) => {
  document.querySelectorAll('.ok-menu-config-panel').forEach(p => p.style.display = 'none');
  if (appCode === 'finance') {
    const el = document.getElementById('okMenuConfigFinance');
    if (el) el.style.display = 'block';
  } else if (appCode === 'gurukul') {
    const el = document.getElementById('okMenuConfigGurukul');
    if (el) el.style.display = 'block';
  } else if (appCode !== 'none') {
    const el = document.getElementById('okMenuConfigGeneric');
    if (el) el.style.display = 'block';
  }
};

// Filter explicit team permissions checklist
window.filterExplicitTeamsClearance = () => {
  const q = (document.getElementById('okTeamClearanceSearch')?.value || '').trim().toLowerCase();
  const container = document.getElementById('okAllowedTeamsList');
  const countEl = document.getElementById('okTeamClearanceCount');
  if (!container) return;
  const labels = container.querySelectorAll('label');
  let matched = 0;
  labels.forEach(lbl => {
    const txt = lbl.textContent.toLowerCase();
    const isMatch = txt.includes(q);
    lbl.style.display = isMatch ? 'flex' : 'none';
    if (isMatch) matched++;
  });
  if (countEl) countEl.innerText = `${matched} matched`;
};

window.toggleSelectAllTeamsClearance = (isChecked) => {
  const container = document.getElementById('okAllowedTeamsList');
  if (!container) return;
  const checkboxes = container.querySelectorAll('input[data-team-clearance]');
  checkboxes.forEach(cb => {
    const parentLabel = cb.closest('label');
    if (parentLabel && parentLabel.style.display !== 'none') {
      cb.checked = isChecked;
    }
  });
};

// Inline Password Reset
async function sendResetEmailInline(email) {
  if (!email) return;
  try {
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    });
    if (error) throw error;
    showToast(`Password reset email sent to ${email}`, 'success');
  } catch (err) {
    showToast(err.message || 'Reset failed', 'error');
  }
}

// Inline Team Management Actions
window.updateTeamAccessInline = async (teamId, accessLevel) => {
  try {
    const { error } = await supabaseClient
      .from('user_teams')
      .update({ access_level: accessLevel })
      .eq('user_id', selectedUserId)
      .eq('team_id', teamId);
    if (error) throw error;
    showToast('Team membership access updated', 'success');
  } catch (err) {
    showToast(err.message || 'Update failed', 'error');
  }
};

window.removeTeamMemberInline = async (teamId) => {
  const ok = await showConfirm('Remove this user from the team?');
  if (!ok) return;
  try {
    const { error } = await supabaseClient
      .from('user_teams')
      .delete()
      .eq('user_id', selectedUserId)
      .eq('team_id', teamId);
    if (error) throw error;
    showToast('Member removed from team', 'success');
    selectUser(selectedUserId);
  } catch (err) {
    showToast(err.message || 'Remove failed', 'error');
  }
};

window.addTeamMemberInline = async (e) => {
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
        user_id: selectedUserId,
        team_id: teamId,
        access_level: accessLevel,
        is_active: true
      });
    if (error) throw error;

    const user = allUsers.find(u => u.id === selectedUserId);
    try {
      await ensureMemberBucketOnWorkTeam(teamId, selectedUserId, user?.name || 'Member', state.user?.id);
    } catch (_) {}

    showToast('User added to team', 'success');
    selectUser(selectedUserId);
  } catch (err) {
    showToast(err.message || 'Addition failed', 'error');
  } finally {
    setButtonLoading(btn, false, 'Add Member');
  }
};

// Inline Profile Save
window.saveUserProfileInline = async (e) => {
  e.preventDefault();
  const name = document.getElementById('okSelectName').value.trim();
  const role = document.getElementById('okSelectRole').value;
  const gender = document.getElementById('okSelectGender').value;
  const tokens = parseInt(document.getElementById('okSelectTokens').value, 10);

  const btn = document.getElementById('okSaveProfileBtn');
  setButtonLoading(btn, true, 'Saving');
  try {
    const { error } = await supabaseClient
      .from('users')
      .update({ name, role, gender, escalation_tokens: tokens })
      .eq('id', selectedUserId);
    if (error) throw error;

    const u = allUsers.find(user => user.id === selectedUserId);
    if (u) {
      u.name = name;
      u.role = role;
      u.gender = gender;
      u.escalation_tokens = tokens;
    }

    showToast('Profile saved successfully', 'success');
    filterOkAdminUsers();
  } catch (err) {
    showToast(err.message || 'Profile save failed', 'error');
  } finally {
    setButtonLoading(btn, false, 'Save Profile');
  }
};

// Bulk Overrides Logic
window.filterOppositeGenderUsers = () => {
  const q = (document.getElementById('okOppositeSearch')?.value || '').trim().toLowerCase();
  const roleFilter = document.getElementById('okOppositeRoleFilter')?.value || '';
  const genderFilter = document.getElementById('okOppositeGenderFilter')?.value || '';
  const teamFilter = document.getElementById('okOppositeTeamFilter')?.value || '';
  const container = document.getElementById('okOppositeList');
  const countEl = document.getElementById('okOppositeCount');
  if (!container) return;

  const matched = window.oppositeGenderUsers.filter(u => {
    const textMatch = !q || (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
    const roleMatch = !roleFilter || u.role === roleFilter;
    const genderMatch = !genderFilter || u.gender === genderFilter;
    const teamMatch = !teamFilter || (window.allUserTeams || []).some(ut => ut.user_id === u.id && ut.team_id === teamFilter);
    return textMatch && roleMatch && genderMatch && teamMatch;
  });

  if (countEl) countEl.innerText = `${matched.length} matched`;

  if (matched.length === 0) {
    container.innerHTML = `<p class="empty-state" style="font-size:0.85em; margin:0; color: var(--text-secondary);">No matching users found.</p>`;
    return;
  }

  // Save the list of current filtered IDs on window for bulk select toggle
  window.currentFilteredOppositeIds = matched.map(u => u.id);

  container.innerHTML = matched.map(u => {
    const isChecked = window.currentAllowedUsers.has(u.id);
    return `
      <label style="display:flex; align-items:center; gap:8px; font-size:0.9em; cursor:pointer; color: var(--text-secondary);">
        <input type="checkbox" data-opposite-user-id="${u.id}" ${isChecked ? 'checked' : ''} onchange="window.toggleIndividualClearanceInline('${u.id}', this.checked)">
        <strong>${escapeHtml(u.name)}</strong> (${escapeHtml(u.role || 'user')})
      </label>
    `;
  }).join('');
};

window.toggleIndividualClearanceInline = (targetId, isChecked) => {
  if (isChecked) {
    window.currentAllowedUsers.add(targetId);
  } else {
    window.currentAllowedUsers.delete(targetId);
  }
};

window.toggleSelectAllOpposite = (isChecked) => {
  const checkboxes = document.querySelectorAll('#okOppositeList input[data-opposite-user-id]');
  checkboxes.forEach(cb => {
    cb.checked = isChecked;
    const uid = cb.dataset.oppositeUserId;
    if (isChecked) {
      window.currentAllowedUsers.add(uid);
    } else {
      window.currentAllowedUsers.delete(uid);
    }
  });
};

async function toggleHold(user) {
  const next = !user.on_hold;
  const ok = await showConfirm(next
    ? 'Put this person on hold? They will not be able to sign in.'
    : 'Clear hold so they can sign in again?');
  if (!ok) return;

  const btn = document.getElementById('okToggleHold');
  setButtonLoading(btn, true, 'Processing');
  try {
    const { error } = await supabaseClient.from('users').update({ on_hold: next }).eq('id', user.id);
    if (error) throw error;
    user.on_hold = next;
    showToast(next ? 'On hold' : 'Hold cleared', 'success');
    await loadUsers();
    selectUser(user.id);
  } catch (err) {
    showToast(err.message || 'Update failed', 'error');
  } finally {
    setButtonLoading(btn, false, next ? 'Remove hold' : 'Place on hold');
  }
}

async function toggleAdmin(user, currentlyAdmin) {
  const actionText = currentlyAdmin
    ? 'Remove One Kailasa Admin from this person?'
    : 'Make this person a One Kailasa Admin?';
  const ok = await showConfirm(actionText);
  if (!ok) return;

  const btn = document.getElementById('okToggleAdmin');
  setButtonLoading(btn, true, 'Processing');
  try {
    if (currentlyAdmin) {
      const { error } = await supabaseClient.from('ok_admins').delete().eq('user_id', user.id);
      if (error) throw error;
    } else {
      const { error } = await supabaseClient.from('ok_admins').insert({ user_id: user.id });
      if (error) throw error;
    }
    showToast('Admin updated', 'success');
    await loadUsers();
    selectUser(user.id);
  } catch (err) {
    showToast(err.message || 'Admin update failed', 'error');
  } finally {
    setButtonLoading(btn, false, currentlyAdmin ? 'Make OK Admin' : 'Remove OK Admin');
  }
}

async function resetAccess(user) {
  const ok = await showConfirm('Remove all custom app permissions and messaging overrides for this person? They will revert to standard gender segregation and default app access.');
  if (!ok) return;

  const btn = document.getElementById('okResetAccess');
  setButtonLoading(btn, true, 'Processing');
  try {
    await Promise.all([
      supabaseClient.from('ok_app_access').delete().eq('user_id', user.id),
      supabaseClient.from('ok_menu_access').delete().eq('user_id', user.id).eq('app_code', 'finance'),
      supabaseClient.from('chat_permissions').delete().eq('user_id', user.id)
    ]);
    showToast('Access permissions reset successfully', 'success');
    await loadUsers();
    selectUser(user.id);
  } catch (err) {
    showToast(err.message || 'Reset failed', 'error');
  } finally {
    setButtonLoading(btn, false, 'Reset Access');
  }
}

async function saveAccess(userId) {
  const isGlobalAdmin = !!state.isOkAdmin;
  const btn = document.getElementById('okSaveAccess');
  setButtonLoading(btn, true, 'Saving');

  const teamId = document.getElementById('okAppAccessTeamSelect')?.value;
  if (!teamId) {
    showToast('Add this user to a team first before configuring app access.', 'error');
    setButtonLoading(btn, false, 'Save Permissions');
    return;
  }

  try {
    const apps = [...document.querySelectorAll('#okAppChecks [data-app]')];
    const menus = [...document.querySelectorAll('#okMenuChecks [data-menu]')];

    await supabaseClient.from('ok_app_access').delete().eq('user_id', userId).eq('team_id', teamId);
    await supabaseClient.from('ok_menu_access').delete().eq('user_id', userId).eq('team_id', teamId).eq('app_code', 'finance');

    const appRows = apps.map(i => ({
      user_id: userId,
      team_id: teamId,
      app_code: i.getAttribute('data-app'),
      enabled: i.checked
    }));
    const menuRows = menus.filter(i => i.checked).map(i => ({
      user_id: userId,
      team_id: teamId,
      app_code: 'finance',
      menu_key: i.getAttribute('data-menu'),
      enabled: true
    }));

    if (appRows.length) {
      const { error } = await supabaseClient.from('ok_app_access').insert(appRows);
      if (error) throw error;
    }
    if (menuRows.length) {
      const { error } = await supabaseClient.from('ok_menu_access').insert(menuRows);
      if (error) throw error;
    }

    const granted = new Set(appRows.filter(r => r.enabled).map(r => r.app_code));
    const { data: existingPins } = await supabaseClient
      .from('ok_home_pins')
      .select('app_code')
      .eq('user_id', userId);
    for (const pin of existingPins || []) {
      if (!granted.has(pin.app_code)) {
        await supabaseClient
          .from('ok_home_pins')
          .delete()
          .eq('user_id', userId)
          .eq('app_code', pin.app_code);
      }
    }
    if (granted.has('finance')) {
      await supabaseClient.from('ok_home_pins').upsert({
        user_id: userId,
        app_code: 'finance',
        sort_order: 0
      }, { onConflict: 'user_id,app_code' });
    }

    // Save Chat Permissions (allow_opposite_gender, cross_team_access, and override lists)
    const allowOpposite = document.getElementById('okAllowOpposite')?.checked || false;
    const crossTeam = document.getElementById('okCrossTeam')?.value || 'none';
    const allowedUsersArray = Array.from(window.currentAllowedUsers || []);
    const allowedRolesArray = [...document.querySelectorAll('#okAllowedRolesList input[data-role-clearance]:checked')].map(el => el.dataset.roleClearance);
    const allowedTeamsArray = [...document.querySelectorAll('#okAllowedTeamsList input[data-team-clearance]:checked')].map(el => el.dataset.teamClearance);

    const { error: permError } = await supabaseClient
      .from('chat_permissions')
      .upsert({
        user_id: userId,
        allow_opposite_gender: allowOpposite,
        cross_team_access: crossTeam,
        allowed_users: allowedUsersArray,
        allowed_roles: allowedRolesArray,
        allowed_teams: allowedTeamsArray
      });

    if (permError) throw permError;

    showToast('Access permissions saved successfully', 'success');
  } catch (err) {
    showToast(err.message || 'Save failed', 'error');
  } finally {
    setButtonLoading(btn, false, 'Save Permissions');
  }
}

function setupCreateModal() {
  const modal = document.getElementById('okAdminCreateModal');
  const openBtn = document.getElementById('okAdminNewBtn');
  const close = () => { modal?.classList.remove('active'); };

  window.filterCreateTeamOptions = () => {
    const q = (document.getElementById('okCreateTeamSearch')?.value || '').trim().toLowerCase();
    const select = document.getElementById('okCreateTeam');
    if (!select) return;
    const matched = (window.allTeamsCacheForCreate || []).filter(t => t.name.toLowerCase().includes(q));
    select.innerHTML = '<option value="">Choose team...</option>' +
      matched.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
  };
  
  openBtn?.addEventListener('click', async () => {
    modal?.classList.add('active');
    const teamSelect = document.getElementById('okCreateTeam');
    if (teamSelect) {
      teamSelect.innerHTML = '<option value="">Loading teams...</option>';
      try {
        const { data: teams, error } = await supabaseClient
          .from('teams')
          .select('id, name')
          .eq('is_personal_team', false)
          .order('name');
        if (error) throw error;
        window.allTeamsCacheForCreate = teams || [];
        window.filterCreateTeamOptions();
      } catch (err) {
        teamSelect.innerHTML = '<option value="">Failed to load teams</option>';
        showToast('Error loading teams: ' + err.message, 'error');
      }
    }
  });

  document.getElementById('okAdminCreateCancel')?.addEventListener('click', close);

  document.getElementById('okAdminCreateForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('okCreateSubmit');
    const name = document.getElementById('okCreateName').value.trim();
    const email = document.getElementById('okCreateEmail').value.trim();
    const password = document.getElementById('okCreatePassword').value;
    const retypePassword = document.getElementById('okCreateRetypePassword').value;
    const gender = document.querySelector('input[name="okCreateGender"]:checked')?.value || '';
    const teamId = document.getElementById('okCreateTeam').value;
    const accessLevel = document.getElementById('okCreateAccessLevel').value;

    if (!gender) {
      showToast('Gender is required', 'error');
      return;
    }

    if (password !== retypePassword) {
      showToast('Passwords do not match', 'error');
      return;
    }

    const lowerPassword = password.toLowerCase();
    const bannedWords = ['nithya', '123', 'ananda', 'swamiji', 'nithyananda', 'kailasa', 'shiva', 'paramashiva'];
    for (const word of bannedWords) {
      if (lowerPassword.includes(word)) {
        showToast(`Password cannot contain the term "${word}"`, 'error');
        return;
      }
    }

    const nameParts = name.toLowerCase().split(/\s+/).map(p => p.trim()).filter(p => p.length >= 2);
    for (const part of nameParts) {
      if (lowerPassword.includes(part)) {
        showToast(`Password cannot contain your name part "${part}"`, 'error');
        return;
      }
    }

    setButtonLoading(btn, true, 'Creating');
    try {
      const { data: sessionData } = await supabaseClient.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Not signed in');

      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY
        },
        body: JSON.stringify({ 
          email, 
          name, 
          password, 
          role: 'user', 
          gender, 
          team_id: teamId, 
          access_level: accessLevel 
        })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload.error) throw new Error(payload.error || 'Create failed');

      const userId = payload.user_id;
      showToast(`Created ${email}`, 'success');
      close();
      document.getElementById('okAdminCreateForm').reset();
      await loadUsers();
      if (userId) selectUser(userId);
    } catch (err) {
      showToast(err.message || 'Create failed', 'error');
    } finally {
      setButtonLoading(btn, false, 'Create');
    }
  });
}
