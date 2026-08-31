import { state } from '../state.js';
import { supabaseClient } from '../db.js';
import { showToast, showConfirm } from './toasts.js';

export async function renderAppRoleManager(containerId, appCode) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `<div style="padding: 20px; text-align: center;">Loading role manager...</div>`;

  try {
    // 1. Fetch available roles for this app
    const { data: roles, error: rolesErr } = await supabaseClient
      .from('app_roles')
      .select('*')
      .eq('app_code', appCode)
      .order('role_code');
      
    if (rolesErr) throw rolesErr;

    // 2. Fetch current assignments
    const { data: assignments, error: assignErr } = await supabaseClient
      .from('app_role_assignments')
      .select('*, users(name, email), teams(name)')
      .eq('app_code', appCode)
      .order('created_at', { ascending: false });

    if (assignErr) throw assignErr;
    
    // 3. Fetch all teams for the dropdown
    const { data: allTeams } = await supabaseClient.from('teams').select('id, name').eq('is_deleted', false).eq('is_personal_team', false).order('name');
    
    // 4. Fetch all users for the dropdown
    const { data: allUsers } = await supabaseClient.from('users').select('id, name, email').order('name');

    window._appRoleContext = {
      appCode,
      roles: roles || [],
      assignments: assignments || [],
      teams: allTeams || [],
      users: allUsers || []
    };

    drawAppRoleManager(container);
  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="error-text">Failed to load role manager: ${err.message}</div>`;
  }
}

function drawAppRoleManager(container) {
  const ctx = window._appRoleContext;
  
  if (!ctx.roles.length) {
    container.innerHTML = `<div class="empty-state">No roles defined for app: ${ctx.appCode}</div>`;
    return;
  }

  const roleOptions = ctx.roles.map(r => `<option value="${r.role_code}">${r.role_name} (${r.role_code.toUpperCase()})</option>`).join('');
  const userOptions = ctx.users.map(u => `<option value="${u.id}">${u.name || u.email}</option>`).join('');
  const teamOptions = ctx.teams.map(t => `<option value="${t.id}">${t.name}</option>`).join('');

  let html = `
    <div class="card" style="margin-bottom: 20px;">
      <h3 style="margin-top:0;">Assign ${ctx.appCode.toUpperCase()} Role</h3>
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 10px; align-items: end;">
        <div class="form-group" style="margin:0;">
          <label>User</label>
          <select id="armNewUser" class="form-control"><option value="">-- Select User --</option>${userOptions}</select>
        </div>
        <div class="form-group" style="margin:0;">
          <label>Role</label>
          <select id="armNewRole" class="form-control" onchange="window.armRoleChanged()"><option value="">-- Select Role --</option>${roleOptions}</select>
        </div>
        <div class="form-group" style="margin:0;">
          <label>Scope</label>
          <select id="armNewScope" class="form-control">
            <option value="global">Global (All Teams / Manager View)</option>
            <optgroup label="Specific Team">
              ${teamOptions}
            </optgroup>
          </select>
        </div>
        <button class="sq-btn primary" onclick="window.armAssignRole()">Assign</button>
      </div>
    </div>
    
    <div class="card">
      <h3 style="margin-top:0;">Active Role Assignments</h3>
      <table class="data-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Role</th>
            <th>Scope</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
  `;

  if (!ctx.assignments.length) {
    html += `<tr><td colspan="4" class="empty-state">No role assignments found.</td></tr>`;
  } else {
    ctx.assignments.forEach(a => {
      const userName = a.users?.name || a.users?.email || 'Unknown';
      const roleName = ctx.roles.find(r => r.role_code === a.role_code)?.role_name || a.role_code;
      const scope = a.team_id ? `Team: ${a.teams?.name || 'Unknown'}` : '<span class="badge primary">Global</span>';
      
      html += `
        <tr>
          <td>${userName}</td>
          <td><strong>${roleName}</strong> (${a.role_code.toUpperCase()})</td>
          <td>${scope}</td>
          <td>
            <button class="sq-btn danger" style="padding:4px 8px; font-size:0.8em;" onclick="window.armRemoveRole('${a.id}')">Revoke</button>
          </td>
        </tr>
      `;
    });
  }

  html += `</tbody></table></div>`;
  container.innerHTML = html;
}

window.armRoleChanged = () => {
  const ctx = window._appRoleContext;
  const roleCode = document.getElementById('armNewRole').value;
  const scopeSelect = document.getElementById('armNewScope');
  if (!roleCode) return;
  
  const role = ctx.roles.find(r => r.role_code === roleCode);
  if (role) {
    if (role.can_be_global && !role.can_be_team) {
      scopeSelect.value = 'global';
      scopeSelect.disabled = true;
    } else if (!role.can_be_global && role.can_be_team) {
      scopeSelect.disabled = false;
      if (scopeSelect.value === 'global') scopeSelect.value = '';
    } else {
      scopeSelect.disabled = false;
    }
  }
};

window.armAssignRole = async () => {
  const userId = document.getElementById('armNewUser').value;
  const roleCode = document.getElementById('armNewRole').value;
  const scope = document.getElementById('armNewScope').value;
  const ctx = window._appRoleContext;

  if (!userId || !roleCode || !scope) {
    showToast('Please select User, Role, and Scope', 'error');
    return;
  }

  const teamId = scope === 'global' ? null : scope;

  try {
    const { error } = await supabaseClient.from('app_role_assignments').insert({
      app_code: ctx.appCode,
      role_code: roleCode,
      user_id: userId,
      team_id: teamId,
      created_by: state.user.id
    });

    if (error) throw error;
    
    showToast('Role assigned successfully', 'success');
    await renderAppRoleManager(document.getElementById('armNewRole').closest('.card').parentElement.id, ctx.appCode);
  } catch (err) {
    console.error(err);
    showToast('Failed to assign role: ' + err.message, 'error');
  }
};

window.armRemoveRole = async (assignmentId) => {
  const ok = await showConfirm('Revoke this role assignment?');
  if (!ok) return;
  
  try {
    const { error } = await supabaseClient.from('app_role_assignments').delete().eq('id', assignmentId);
    if (error) throw error;
    
    showToast('Role revoked', 'success');
    const ctx = window._appRoleContext;
    await renderAppRoleManager(document.querySelector('#armNewRole').closest('.card').parentElement.id, ctx.appCode);
  } catch (err) {
    console.error(err);
    showToast('Failed to revoke role: ' + err.message, 'error');
  }
};
