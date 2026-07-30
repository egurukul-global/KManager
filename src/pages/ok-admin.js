import { state } from '../state.js';
import { supabaseClient, SUPABASE_URL, SUPABASE_ANON_KEY } from '../db.js';
import { showToast, showConfirm } from '../components/toasts.js';
import { setButtonLoading } from '../utils/uiHelpers.js';
import {
  isOkAdmin,
  OK_APPS,
  FINANCE_MENU_KEYS
} from '../utils/okAccess.js';
import { renderOkShell, initOkShell } from './ok-shell.js';

let allUsers = [];
let selectedUserId = null;

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
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

  return renderOkShell({
    activePath: '/admin',
    title: 'Admin',
    bottomTab: 'admin',
    mainHtml: `
      <h1 class="page-title">People &amp; app access</h1>
      <p class="page-intro">Create logins and decide which apps and Finance menus each person can open.</p>

      <div class="card">
        <div class="form-grid-row form-grid-row--user-filters">
          <div class="form-group">
            <label>Search</label>
            <input type="text" id="okAdminSearch" placeholder="Name or email" oninput="window.filterOkAdminUsers()">
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
        <h2>All people</h2>
        <div class="table-container show-desktop">
          <table class="table-stack-mobile user-mgmt-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="okAdminTableBody">
              <tr><td colspan="4" class="empty-state">Loading…</td></tr>
            </tbody>
          </table>
        </div>
        <div id="okAdminMobile" class="show-mobile data-card-list"></div>
      </div>

      <div class="card" id="okAdminDetailCard" style="display:none;">
        <div id="okAdminDetail"></div>
      </div>

      <div id="okAdminCreateModal" class="modal">
        <div class="modal-content" style="max-width:440px;">
          <button type="button" class="close-modal" id="okAdminCreateClose">&times;</button>
          <h2>New person</h2>
          <form id="okAdminCreateForm">
            <div class="form-group">
              <label for="okCreateName">Full name</label>
              <input type="text" id="okCreateName" required autocomplete="name">
            </div>
            <div class="form-group">
              <label for="okCreateEmail">Email (login)</label>
              <input type="email" id="okCreateEmail" required autocomplete="email">
            </div>
            <div class="form-group">
              <label for="okCreatePassword">Password (8+)</label>
              <input type="password" id="okCreatePassword" required minlength="8" autocomplete="new-password">
            </div>
            <label class="ok-pin-check"><input type="checkbox" id="okCreateFinance" checked> Grant Finance app</label>
            <div class="btn-group" style="margin-top:16px;">
              <button type="submit" id="okCreateSubmit">Create</button>
              <button type="button" class="secondary" id="okAdminCreateCancel">Cancel</button>
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
  setupCreateModal();
  loadUsers();
}

async function loadUsers() {
  const { data, error } = await supabaseClient
    .from('users')
    .select('id, email, name, role, on_hold, gender, clearance_level, escalation_tokens')
    .order('name');
  if (error) {
    showToast(error.message || 'Could not load people', 'error');
    return;
  }
  allUsers = data || [];
  filterOkAdminUsers();
}

function filterOkAdminUsers() {
  const q = (document.getElementById('okAdminSearch')?.value || '').trim().toLowerCase();
  const tbody = document.getElementById('okAdminTableBody');
  const mobile = document.getElementById('okAdminMobile');
  const filtered = allUsers.filter(u => {
    if (!q) return true;
    return (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
  });

  if (!filtered.length) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No people found.</td></tr>';
    if (mobile) mobile.innerHTML = '<p class="empty-state">No people found.</p>';
    return;
  }

  if (tbody) {
    tbody.innerHTML = filtered.map(u => `
      <tr class="${u.id === selectedUserId ? 'row-selected' : ''}">
        <td data-label="Name">${escapeHtml(u.name || '—')}</td>
        <td data-label="Email">${escapeHtml(u.email || '')}</td>
        <td data-label="Status">${u.on_hold ? '<span class="status-badge status-hold">On hold</span>' : '<span class="status-badge status-active">Active</span>'}</td>
        <td data-label="">
          <button type="button" class="secondary" onclick="window.selectOkAdminUser('${u.id}')">Select</button>
        </td>
      </tr>
    `).join('');
  }

  if (mobile) {
    mobile.innerHTML = filtered.map(u => `
      <article class="data-card data-card--compact ${u.id === selectedUserId ? 'data-card--selected' : ''}">
        <div class="data-card-top">
          <span class="data-card-title">${escapeHtml(u.name || '—')}</span>
          ${u.on_hold ? '<span class="status-badge status-hold">On hold</span>' : '<span class="status-badge status-active">Active</span>'}
        </div>
        <div class="data-card-row"><span class="data-card-row-label">Email</span><span class="data-card-row-value">${escapeHtml(u.email || '')}</span></div>
        <div class="btn-group" style="margin-top:10px;">
          <button type="button" onclick="window.selectOkAdminUser('${u.id}')">Select</button>
        </div>
      </article>
    `).join('');
  }
}

async function selectUser(userId) {
  selectedUserId = userId;
  filterOkAdminUsers();
  const detailCard = document.getElementById('okAdminDetailCard');
  const detail = document.getElementById('okAdminDetail');
  const user = allUsers.find(u => u.id === userId);
  if (!detail || !user) return;

  if (detailCard) detailCard.style.display = '';
  detail.innerHTML = `<p class="empty-state">Loading user details and memberships…</p>`;
  detail.scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    const [appsRes, menusRes, adminRes, userTeamsRes, chatPermRes, allTeamsRes] = await Promise.all([
      supabaseClient.from('ok_app_access').select('app_code, enabled').eq('user_id', userId),
      supabaseClient.from('ok_menu_access').select('menu_key, enabled').eq('user_id', userId).eq('app_code', 'finance'),
      supabaseClient.from('ok_admins').select('user_id').eq('user_id', userId).maybeSingle(),
      supabaseClient.from('user_teams').select('id, team_id, access_level, teams:team_id(id, name, is_personal_team)').eq('user_id', userId),
      supabaseClient.from('chat_permissions').select('*').eq('user_id', userId).maybeSingle(),
      supabaseClient.from('teams').select('id, name').eq('is_personal_team', false).order('name')
    ]);

    const appSet = new Set((appsRes.data || []).filter(a => a.enabled).map(a => a.app_code));
    const menuSet = new Set((menusRes.data || []).filter(m => m.enabled).map(m => m.menu_key));
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

    // Filter opposite gender users in memory
    const myGender = user.gender || '';
    const oppositeGenderUsers = myGender
      ? allUsers.filter(u => u.id !== userId && u.gender && u.gender !== myGender && !u.on_hold)
      : allUsers.filter(u => u.id !== userId && !u.on_hold);

    detail.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
        <div>
          <h2 style="margin:0;">${escapeHtml(user.name || '—')}</h2>
          <p class="page-intro" style="margin:4px 0 16px;">${escapeHtml(user.email || '')}</p>
        </div>
        <div class="btn-group">
          <button type="button" class="${user.on_hold ? 'secondary' : ''}" id="okToggleHold" ${isGlobalAdmin ? '' : 'disabled style="opacity:0.6; pointer-events:none;"'}>
            ${user.on_hold ? 'Clear hold' : 'Put on hold'}
          </button>
          <button type="button" class="secondary" id="okToggleAdmin" ${isGlobalAdmin ? '' : 'disabled style="opacity:0.6; pointer-events:none;"'}>
            ${isAdmin ? 'Remove OK Admin' : 'Make OK Admin'}
          </button>
        </div>
      </div>

      <!-- Tab Buttons -->
      <div class="tabs-container" style="margin-bottom: 20px; display: flex; gap: 10px; border-bottom: 1px solid var(--border); padding-bottom: 10px;">
        <button type="button" class="tab-btn active" id="btnTabProfile" onclick="window.switchOkAdminTab('profile')" style="background: none; border: none; padding: 8px 16px; cursor: pointer; font-weight: bold; border-bottom: 3px solid var(--primary); color: var(--text);">Identity & Roles</button>
        <button type="button" class="tab-btn" id="btnTabTeams" onclick="window.switchOkAdminTab('teams')" style="background: none; border: none; padding: 8px 16px; cursor: pointer; color: var(--text-secondary);">Teams</button>
        <button type="button" class="tab-btn" id="btnTabPermissions" onclick="window.switchOkAdminTab('permissions')" style="background: none; border: none; padding: 8px 16px; cursor: pointer; color: var(--text-secondary);">Permissions</button>
      </div>

      <!-- TAB 1: Identity & Roles -->
      <div id="tabContentProfile" class="tab-content" style="display: block;">
        <form id="okProfileForm" onsubmit="window.saveUserProfileInline(event)">
          <div class="form-grid" style="margin-bottom:16px;">
            <div class="form-group">
              <label for="okSelectName">Full Name *</label>
              <input type="text" id="okSelectName" required maxlength="120" value="${escapeHtml(user.name || '')}">
            </div>
            <div class="form-group">
              <label for="okSelectRole">Global Role</label>
              <select id="okSelectRole" class="form-control" ${isGlobalAdmin ? '' : 'disabled'}>
                <option value="user" ${user.role === 'user' ? 'selected' : ''}>User</option>
                <option value="fin" ${user.role === 'fin' ? 'selected' : ''}>FIN (Finance Reviewer)</option>
                <option value="fip" ${user.role === 'fip' ? 'selected' : ''}>FIP (Finance Payments)</option>
                <option value="oh" ${user.role === 'oh' ? 'selected' : ''}>OH (Finance Head)</option>
                <option value="caoh" ${user.role === 'caoh' ? 'selected' : ''}>CAOH (Chief Admin)</option>
                <option value="ceo" ${user.role === 'ceo' ? 'selected' : ''}>CEO</option>
                <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin (SYS)</option>
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
      <div id="tabContentTeams" class="tab-content" style="display: none;">
        <h3>Team Memberships</h3>
        <div class="table-container show-desktop">
          <table class="table-stack-mobile">
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
        <form id="okAddUserTeamForm" onsubmit="window.addTeamMemberInline(event)" style="background:var(--bg-secondary); padding:16px; border-radius:8px; border:1px solid var(--border);">
          <div class="form-grid" style="align-items:flex-end; gap:16px; margin-bottom:12px;">
            <div class="form-group">
              <label for="okAddTeamSelect">Select Team</label>
              <select id="okAddTeamSelect" required style="width:100%;">
                <option value="">Choose team…</option>
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
      </div>

      <!-- TAB 3: Permissions -->
      <div id="tabContentPermissions" class="tab-content" style="display: none;">
        <h3>App & Menu Access</h3>
        <h4 style="margin:12px 0 6px;">Applications</h4>
        <div class="ok-access-checks" id="okAppChecks" style="margin-bottom:16px;">
          ${OK_APPS.map(a => {
            const canManage = isGlobalAdmin || managedApps.includes(a.code);
            const disabled = canManage ? '' : 'disabled';
            return `
              <label class="ok-pin-check" style="${canManage ? '' : 'opacity: 0.6; pointer-events: none;'}">
                <input type="checkbox" data-app="${a.code}" ${appSet.has(a.code) ? 'checked' : ''} ${disabled}>
                ${escapeHtml(a.label)}${a.live ? '' : ' (soon)'}
              </label>
            `;
          }).join('')}
        </div>

        <h4 style="margin:12px 0 6px;">Finance menus</h4>
        <div class="ok-access-checks ok-access-checks--menus" id="okMenuChecks" style="margin-bottom:20px;">
          ${FINANCE_MENU_KEYS.map(m => {
            const canManage = isGlobalAdmin || managedApps.includes('finance');
            const disabled = canManage ? '' : 'disabled';
            return `
              <label class="ok-pin-check" style="${canManage ? '' : 'opacity: 0.6; pointer-events: none;'}">
                <input type="checkbox" data-menu="${m.key}" ${menuSet.has(m.key) ? 'checked' : ''} ${disabled}>
                ${escapeHtml(m.label)}
              </label>
            `;
          }).join('')}
        </div>

        <h3 style="border-top:1px solid var(--border); padding-top:16px; margin-top:20px;">Konnect Clearances</h3>
        <div class="form-grid" style="margin-bottom:16px;">
          <div class="form-group" style="display:flex; align-items:center; gap:8px;">
            <input type="checkbox" id="okAllowOpposite" ${allowOpposite ? 'checked' : ''} style="cursor:pointer; width:16px; height:16px;">
            <label for="okAllowOpposite" style="cursor:pointer; font-weight:600; margin:0; user-select:none;">Allow opposite gender messaging</label>
          </div>
          <div class="form-group">
            <label for="okCrossTeam">Cross-team clearance</label>
            <select id="okCrossTeam" style="width:100%;">
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
          ${allTeamsRes.data?.map(t => {
            const isChecked = allowedTeamsList.includes(t.id);
            return `<label style="cursor:pointer;"><input type="checkbox" data-team-clearance="${t.id}" ${isChecked ? 'checked' : ''}> ${escapeHtml(t.name)}</label>`;
          }).join('')}
        </div>

        <!-- Opposite Gender Bulk Filter Checkbox List -->
        <h4 style="margin:12px 0 6px;">Explicit Individual Clearances</h4>
        <p class="section-hint" style="margin-bottom:12px;">Search and whitelist specific individuals (e.g. opposite-gender) for direct chat override.</p>
        
        <div class="form-grid-row" style="display:flex; gap:10px; margin-bottom:12px;">
          <input type="text" id="okOppositeSearch" placeholder="Search name/email..." oninput="window.filterOppositeGenderUsers()" style="flex:1; height:36px; padding:6px; border:1px solid var(--border); border-radius:6px;">
          <select id="okOppositeRoleFilter" onchange="window.filterOppositeGenderUsers()" style="width:160px; height:36px; border-radius:6px; border:1px solid var(--border); padding:6px;">
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
            <input type="checkbox" id="okSelectAllOpposite" onchange="window.toggleSelectAllOpposite(this.checked)"> Select All Matching
          </label>
          <span id="okOppositeCount" style="font-size:0.8em; color:var(--text-secondary);">0 matched</span>
        </div>

        <div id="okOppositeList" style="max-height:150px; overflow-y:auto; border:1px solid var(--border); border-radius:6px; padding:8px; background:var(--bg-secondary); display:flex; flex-direction:column; gap:6px; margin-bottom:20px;">
          <!-- Loaded dynamically -->
        </div>

        <div class="btn-group">
          <button type="button" id="okSaveAccess">Save Permissions</button>
        </div>
      </div>
    `;

    document.getElementById('okToggleHold')?.addEventListener('click', () => toggleHold(user));
    document.getElementById('okToggleAdmin')?.addEventListener('click', () => toggleAdmin(user, isAdmin));
    document.getElementById('okSaveAccess')?.addEventListener('click', () => saveAccess(userId));
    document.getElementById('okResetPwdBtn')?.addEventListener('click', () => sendResetEmailInline(user.email));

    // Store whitelisted user set globally on window for dynamic checkbox access
    window.currentAllowedUsers = new Set(allowedUsersList);
    window.oppositeGenderUsers = oppositeGenderUsers;

    // Trigger initial filter load
    window.filterOppositeGenderUsers();

  } catch (err) {
    console.error('Load details error:', err);
    detail.innerHTML = `<p class="empty-state" style="color:var(--danger);">Error loading details: ${escapeHtml(err.message)}</p>`;
  }
}

// Inline tab switcher
window.switchOkAdminTab = (tabName) => {
  const tabProfile = document.getElementById('tabContentProfile');
  const tabTeams = document.getElementById('tabContentTeams');
  const tabPermissions = document.getElementById('tabContentPermissions');
  const btnProfile = document.getElementById('btnTabProfile');
  const btnTeams = document.getElementById('btnTabTeams');
  const btnPermissions = document.getElementById('btnTabPermissions');

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

  const activeBtn = document.getElementById(`btnTab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
  if (activeBtn) {
    activeBtn.classList.add('active');
    activeBtn.style.borderBottom = '3px solid var(--primary)';
    activeBtn.style.color = 'var(--text)';
    activeBtn.style.fontWeight = 'bold';
  }
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
  const container = document.getElementById('okOppositeList');
  const countEl = document.getElementById('okOppositeCount');
  if (!container) return;

  const matched = window.oppositeGenderUsers.filter(u => {
    const textMatch = !q || (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
    const roleMatch = !roleFilter || u.role === roleFilter;
    return textMatch && roleMatch;
  });

  if (countEl) countEl.innerText = `${matched.length} matched`;

  if (matched.length === 0) {
    container.innerHTML = `<p class="empty-state" style="font-size:0.85em; margin:0;">No matching users found.</p>`;
    return;
  }

  // Save the list of current filtered IDs on window for bulk select toggle
  window.currentFilteredOppositeIds = matched.map(u => u.id);

  container.innerHTML = matched.map(u => {
    const isChecked = window.currentAllowedUsers.has(u.id);
    return `
      <label style="display:flex; align-items:center; gap:8px; font-size:0.9em; cursor:pointer;">
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
  const { error } = await supabaseClient.from('users').update({ on_hold: next }).eq('id', user.id);
  if (error) {
    showToast(error.message || 'Update failed', 'error');
    return;
  }
  user.on_hold = next;
  showToast(next ? 'On hold' : 'Hold cleared', 'success');
  filterOkAdminUsers();
  selectUser(user.id);
}

async function toggleAdmin(user, currentlyAdmin) {
  if (currentlyAdmin) {
    const ok = await showConfirm('Remove One Kailasa Admin from this person?');
    if (!ok) return;
    const { error } = await supabaseClient.from('ok_admins').delete().eq('user_id', user.id);
    if (error) return showToast(error.message, 'error');
  } else {
    const { error } = await supabaseClient.from('ok_admins').insert({ user_id: user.id });
    if (error) return showToast(error.message, 'error');
  }
  showToast('Admin updated', 'success');
  selectUser(user.id);
}

async function saveAccess(userId) {
  const isGlobalAdmin = !!state.isOkAdmin;
  const btn = document.getElementById('okSaveAccess');
  setButtonLoading(btn, true, 'Saving');

  try {
    const apps = [...document.querySelectorAll('#okAppChecks [data-app]')];
    const menus = [...document.querySelectorAll('#okMenuChecks [data-menu]')];

    await supabaseClient.from('ok_app_access').delete().eq('user_id', userId);
    await supabaseClient.from('ok_menu_access').delete().eq('user_id', userId).eq('app_code', 'finance');

    const appRows = apps.filter(i => i.checked).map(i => ({
      user_id: userId,
      app_code: i.getAttribute('data-app'),
      enabled: true
    }));
    const menuRows = menus.filter(i => i.checked).map(i => ({
      user_id: userId,
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

    const granted = new Set(appRows.map(r => r.app_code));
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
  openBtn?.addEventListener('click', () => { modal?.classList.add('active'); });
  document.getElementById('okAdminCreateClose')?.addEventListener('click', close);
  document.getElementById('okAdminCreateCancel')?.addEventListener('click', close);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  document.getElementById('okAdminCreateForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('okCreateSubmit');
    const name = document.getElementById('okCreateName').value.trim();
    const email = document.getElementById('okCreateEmail').value.trim();
    const password = document.getElementById('okCreatePassword').value;
    const grantFinance = document.getElementById('okCreateFinance').checked;

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
        body: JSON.stringify({ email, name, password, role: 'user' })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload.error) throw new Error(payload.error || 'Create failed');

      const userId = payload.user_id;
      if (userId && grantFinance) {
        await supabaseClient.from('ok_app_access').upsert({
          user_id: userId,
          app_code: 'finance',
          enabled: true
        }, { onConflict: 'user_id,app_code' });

        const menuRows = FINANCE_MENU_KEYS.map(m => ({
          user_id: userId,
          app_code: 'finance',
          menu_key: m.key,
          enabled: true
        }));
        await supabaseClient.from('ok_menu_access').upsert(menuRows, { onConflict: 'user_id,app_code,menu_key' });
        await supabaseClient.from('ok_home_pins').upsert({
          user_id: userId,
          app_code: 'finance',
          sort_order: 0
        }, { onConflict: 'user_id,app_code' });
      }

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
