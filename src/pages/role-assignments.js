// ==================== ROLE ASSIGNMENTS — FIN etc. (Phase 4B) ====================
import { state } from '../state.js';
import { supabaseClient } from '../db.js';
import { showToast } from '../components/toasts.js';
import { cardRow } from '../utils/uiHelpers.js';
import { canManageRoleAssignments } from '../utils/approvalAccess.js';

const ASSIGNABLE_ROLES = ['FIN', 'LEG', 'LEH', 'GUT', 'GUH'];

export function getRoleAssignmentsPage() {
  if (!canManageRoleAssignments()) {
    return `
      <h1 class="page-title">Role Assignments</h1>
      <div class="card"><p class="empty-state">Only FIH, CAO, or system admin can manage role assignments.</p></div>
    `;
  }

  return `
    <h1 class="page-title">Role Assignments</h1>
    <p class="page-intro">Assign FIN and extended request roles per team. FIH and CAO are org roles — not assigned here.</p>

    <div class="card">
      <h2>Add assignment</h2>
      <form id="roleAssignForm" onsubmit="window.saveRoleAssignment(event)">
        <div class="form-grid">
          <div class="form-group">
            <label>User email</label>
            <input type="email" id="roleAssignEmail" required placeholder="user@example.com">
          </div>
          <div class="form-group">
            <label>Role code</label>
            <select id="roleAssignCode" required>
              ${ASSIGNABLE_ROLES.map(r => `<option value="${r}">${r}</option>`).join('')}
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
      <div id="roleAssignList" class="data-card-list"><p class="empty-state">Loading…</p></div>
    </div>
  `;
}

export async function initRoleAssignmentsPage() {
  window.saveRoleAssignment = saveRoleAssignment;
  window.deactivateRoleAssignment = deactivateRoleAssignment;

  if (!canManageRoleAssignments()) return;

  const teamSelect = document.getElementById('roleAssignTeam');
  if (teamSelect) {
    (state.teams || []).forEach(t => {
      teamSelect.innerHTML += `<option value="${t.team_id}">${t.team_name}</option>`;
    });
  }

  await loadAssignments();
}

async function loadAssignments() {
  const listEl = document.getElementById('roleAssignList');
  if (!listEl) return;

  try {
    const { data, error } = await supabaseClient
      .from('request_role_assignments')
      .select(`
        id, role_code, team_id, request_type, is_active, created_at,
        users:user_id ( id, name, email ),
        teams:team_id ( name )
      `)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!data?.length) {
      listEl.innerHTML = '<p class="empty-state">No active assignments yet.</p>';
      return;
    }

    listEl.innerHTML = data.map(row => `
      <article class="data-card data-card--compact">
        <div class="data-card-top">
          <span class="data-card-title">${row.users?.name || row.users?.email || 'User'}</span>
          <span class="badge badge-info">${row.role_code}</span>
        </div>
        ${cardRow('Email', row.users?.email || '—')}
        ${cardRow('Team', row.teams?.name || 'Global')}
        ${cardRow('Request type', row.request_type || 'All')}
        <div class="btn-group" style="margin-top:8px;">
          <button type="button" class="secondary small danger" onclick="window.deactivateRoleAssignment('${row.id}')">Remove</button>
        </div>
      </article>
    `).join('');
  } catch (err) {
    listEl.innerHTML = `<p class="empty-state" style="color:#dc3545;">${err.message}</p>`;
  }
}

async function saveRoleAssignment(e) {
  e.preventDefault();
  if (!canManageRoleAssignments()) return;

  const email = document.getElementById('roleAssignEmail')?.value?.trim();
  const roleCode = document.getElementById('roleAssignCode')?.value;
  const teamId = document.getElementById('roleAssignTeam')?.value || null;
  const requestType = document.getElementById('roleAssignType')?.value || null;

  try {
    const { data: users, error: userErr } = await supabaseClient
      .from('users')
      .select('id, email')
      .ilike('email', email)
      .limit(1);

    if (userErr) throw userErr;
    const user = users?.[0];
    if (!user) throw new Error('User not found with that email');

    const { error } = await supabaseClient.from('request_role_assignments').insert({
      user_id: user.id,
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

    showToast(`Assigned ${roleCode} to ${user.email}`, 'success');
    document.getElementById('roleAssignForm')?.reset();
    await loadAssignments();
  } catch (err) {
    showToast(err.message || 'Failed to save assignment', 'error');
  }
}

async function deactivateRoleAssignment(id) {
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
}
