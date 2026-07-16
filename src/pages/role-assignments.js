// ==================== ROLE ASSIGNMENTS — FIN etc. (Phase 4B) ====================
import { state } from '../state.js';
import { supabaseClient } from '../db.js';
import { showToast, showConfirm } from '../components/toasts.js';
import { cardRow } from '../utils/uiHelpers.js';
import { canManageRoleAssignments } from '../utils/approvalAccess.js';

const EXTENDED_ROLES = ['FIN', 'FIP', 'LEG', 'LEH', 'GUT', 'GUH'];
const ORG_ASSIGNABLE_ROLES = ['FIH', 'CAO'];

let usersCache = [];

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function userLabel(user) {
  if (!user) return 'Unknown';
  const name = user.name?.trim();
  const email = user.email?.trim();
  if (name && email) return `${name} (${email})`;
  return name || email || 'Unknown';
}

function getAssignableRoles() {
  const role = String(state.user?.role || 'user').toLowerCase();
  if (role === 'admin') return [...ORG_ASSIGNABLE_ROLES, ...EXTENDED_ROLES];
  return EXTENDED_ROLES;
}

function roleAssignmentIntro() {
  const role = String(state.user?.role || 'user').toLowerCase();
  if (role === 'admin') {
    return 'System admin can assign FIH, CAO, and extended request roles (FIN, LEG, etc.) per team.';
  }
  return 'Assign FIN and extended request roles per team. FIH and CAO are normally org roles on user accounts.';
}

export function getRoleAssignmentsPage() {
  if (!canManageRoleAssignments()) {
    return `
      <h1 class="page-title">Role Assignments</h1>
      <div class="card"><p class="empty-state">Only FIH, CAO, or system admin can manage role assignments.</p></div>
    `;
  }

  const roles = getAssignableRoles();

  return `
    <h1 class="page-title">Role Assignments</h1>
    <p class="page-intro">${roleAssignmentIntro()}</p>

    <div class="card">
      <h2>Add assignment</h2>
      <form id="roleAssignForm" onsubmit="window.saveRoleAssignment(event)">
        <div class="form-grid">
          <div class="form-group">
            <label>User</label>
            <select id="roleAssignUserId" required>
              <option value="">Loading users…</option>
            </select>
          </div>
          <div class="form-group">
            <label>Role code</label>
            <select id="roleAssignCode" required>
              ${roles.map(r => `<option value="${r}">${r}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Team (optional)</label>
            <select id="roleAssignTeam">
              <option value="">All teams (global)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Request type (optional)</label>
            <select id="roleAssignType">
              <option value="">All types</option>
              <option value="budget">Budget</option>
              <option value="money_transfer">Money Transfer</option>
              <option value="reconciliation_adjustment">Reconciliation</option>
            </select>
          </div>
        </div>
        <div class="btn-group">
          <button type="submit">Assign</button>
          <button type="button" class="secondary" onclick="window.showPage('approval-portal')">Back to portal</button>
        </div>
      </form>
    </div>

    <div class="card">
      <h2>Current assignments</h2>
      <div class="table-container show-desktop">
        <table class="table-stack-mobile">
          <thead>
            <tr><th>User</th><th>Email</th><th>Role</th><th>Team</th><th>Request type</th><th></th></tr>
          </thead>
          <tbody id="roleAssignTableBody">
            <tr><td colspan="6" class="empty-state">Loading…</td></tr>
          </tbody>
        </table>
      </div>
      <div id="roleAssignList" class="show-mobile data-card-list"><p class="empty-state">Loading…</p></div>
    </div>
  `;
}

async function loadUsersCache() {
  try {
    const { data, error } = await supabaseClient
      .from('users')
      .select('id, name, email')
      .order('name');

    usersCache = error ? [] : (data || []);
  } catch (err) {
    console.warn('Failed to load users for role assignments:', err);
    usersCache = [];
  }
}

function populateUserSelect() {
  const select = document.getElementById('roleAssignUserId');
  if (!select) return;

  if (!usersCache.length) {
    select.innerHTML = '<option value="">No users available</option>';
    return;
  }

  select.innerHTML = '<option value="">Select user…</option>';
  usersCache.forEach(user => {
    select.innerHTML += `<option value="${user.id}">${escapeHtml(userLabel(user))}</option>`;
  });
}

export async function initRoleAssignmentsPage() {
  window.saveRoleAssignment = saveRoleAssignment;
  window.deactivateRoleAssignment = deactivateRoleAssignment;

  if (!canManageRoleAssignments()) return;

  await loadUsersCache();
  populateUserSelect();

  const teamSelect = document.getElementById('roleAssignTeam');
  if (teamSelect) {
    const { data: teams } = await supabaseClient
      .from('teams')
      .select('id, name')
      .eq('is_personal_team', false)
      .order('name');
    (teams || []).forEach(t => {
      teamSelect.innerHTML += `<option value="${t.id}">${escapeHtml(t.name)}</option>`;
    });
  }

  await loadAssignments();
}

async function loadAssignments() {
  const listEl = document.getElementById('roleAssignList');
  const tableBody = document.getElementById('roleAssignTableBody');
  if (!listEl && !tableBody) return;

  try {
    const { data, error } = await supabaseClient
      .from('request_role_assignments')
      .select('id, user_id, role_code, team_id, request_type, is_active, created_at')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!data?.length) {
      if (listEl) listEl.innerHTML = '<p class="empty-state">No active assignments yet.</p>';
      if (tableBody) tableBody.innerHTML = '<tr><td colspan="6" class="empty-state">No active assignments yet.</td></tr>';
      return;
    }

    const userIds = [...new Set(data.map(r => r.user_id).filter(Boolean))];
    const teamIds = [...new Set(data.map(r => r.team_id).filter(Boolean))];

    const [{ data: users }, { data: teams }] = await Promise.all([
      userIds.length
        ? supabaseClient.from('users').select('id, name, email').in('id', userIds)
        : Promise.resolve({ data: [] }),
      teamIds.length
        ? supabaseClient.from('teams').select('id, name').in('id', teamIds)
        : Promise.resolve({ data: [] })
    ]);

    const userMap = Object.fromEntries((users || []).map(u => [u.id, u]));
    const teamMap = Object.fromEntries((teams || []).map(t => [t.id, t]));

    let tableHtml = '';
    let mobileHtml = '';

    data.forEach(row => {
      const user = userMap[row.user_id];
      const teamName = row.team_id ? (teamMap[row.team_id]?.name || 'Team') : 'Global';
      const name = user?.name || user?.email || row.user_id?.slice(0, 8) || 'User';
      const email = user?.email || '—';

      tableHtml += `
        <tr>
          <td data-label="User">${escapeHtml(name)}</td>
          <td data-label="Email">${escapeHtml(email)}</td>
          <td data-label="Role"><span class="badge badge-info">${row.role_code}</span></td>
          <td data-label="Team">${escapeHtml(teamName)}</td>
          <td data-label="Request type">${row.request_type || 'All'}</td>
          <td data-label="Actions">
            <button type="button" class="secondary small danger" onclick="window.deactivateRoleAssignment('${row.id}')">Remove</button>
          </td>
        </tr>
      `;

      mobileHtml += `
        <article class="data-card data-card--compact">
          <div class="data-card-top">
            <span class="data-card-title">${escapeHtml(name)}</span>
            <span class="badge badge-info">${row.role_code}</span>
          </div>
          ${cardRow('Email', email)}
          ${cardRow('Team', teamName)}
          ${cardRow('Request type', row.request_type || 'All')}
          <div class="btn-group" style="margin-top:8px;">
            <button type="button" class="secondary small danger" onclick="window.deactivateRoleAssignment('${row.id}')">Remove</button>
          </div>
        </article>
      `;
    });

    if (tableBody) tableBody.innerHTML = tableHtml;
    if (listEl) listEl.innerHTML = mobileHtml;
  } catch (err) {
    const msg = err.message || 'Failed to load assignments';
    if (listEl) listEl.innerHTML = `<p class="empty-state" style="color:#dc3545;">${msg}</p>`;
    if (tableBody) tableBody.innerHTML = `<tr><td colspan="6" class="empty-state" style="color:#dc3545;">${msg}</td></tr>`;
  }
}

async function saveRoleAssignment(e) {
  e.preventDefault();
  if (!canManageRoleAssignments()) return;

  const userId = document.getElementById('roleAssignUserId')?.value;
  const roleCode = document.getElementById('roleAssignCode')?.value;
  const teamId = document.getElementById('roleAssignTeam')?.value || null;
  const requestType = document.getElementById('roleAssignType')?.value || null;

  if (!userId) {
    showToast('Select a user', 'error');
    return;
  }

  const allowed = getAssignableRoles();
  if (!allowed.includes(roleCode)) {
    showToast('You cannot assign that role', 'error');
    return;
  }

  const user = usersCache.find(u => u.id === userId);

  try {
    const { error } = await supabaseClient.from('request_role_assignments').insert({
      user_id: userId,
      role_code: roleCode,
      team_id: teamId || null,
      request_type: requestType || null,
      assigned_by: state.user.id,
      is_active: true
    });

    if (error) {
      if (error.code === '23505') throw new Error('That assignment already exists');
      throw error;
    }

    showToast(`Assigned ${roleCode} to ${user?.email || 'user'}`, 'success');
    document.getElementById('roleAssignForm')?.reset();
    populateUserSelect();
    await loadAssignments();
  } catch (err) {
    showToast(err.message || 'Failed to save assignment', 'error');
  }
}

function deactivateRoleAssignment(id) {
  showConfirm('Are you sure you want to remove this role assignment?', async () => {
    try {
      const { error } = await supabaseClient
        .from('request_role_assignments')
        .update({ is_active: false })
        .eq('id', id);

      if (error) throw error;
      showToast('Assignment removed', 'success');
      await loadAssignments();
    } catch (err) {
      showToast(err.message || 'Failed to remove', 'error');
    }
  });
}
