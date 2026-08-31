import re

with open('src/pages/buckets.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update Card Icons
# Users icon
old_users_icon = r"<button type=\"button\" class=\"btn-icon\" onclick=\"window\.openAssignUsersModal\('\$\{bucket\.id\}', '\$\{safeName\}'\)\" title=\"Assign Users\" aria-label=\"Assign Users\" style=\"background: none; border: none; color: var\(--accent-color\); cursor: pointer; padding: 4px;\">Users</button>"
new_users_icon = r"<button type=\"button\" class=\"btn-icon\" onclick=\"window.openAssignUsersModal('${bucket.id}', '${safeName}')\" title=\"Manage Users\" aria-label=\"Manage Users\" style=\"background: #007bff; border: none; color: white; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 0.9em;\"><i class=\"fas fa-plus\"></i></button>"
content = re.sub(old_users_icon, new_users_icon, content)

# Edit bucket icon
old_edit_icon = r"\$\{canEdit \? btnIconEdit\(`window\.loadBucketForEdit\('\$\{bucket\.id\}'\)`\) : ''\}"
new_edit_icon = r"${canEdit ? `<button type=\"button\" class=\"btn-icon\" onclick=\"window.loadBucketForEdit('${bucket.id}')\" title=\"Edit Bucket\" aria-label=\"Edit Bucket\" style=\"background: none; border: none; color: #48bb78; cursor: pointer; font-size: 1.1em; padding: 4px;\"><i class=\"fas fa-check-square\"></i></button>` : ''}"
content = re.sub(old_edit_icon, new_edit_icon, content)

# 2. Re-write the assignUsersModal HTML
old_modal = r"if \(!document\.getElementById\('assignUsersModal'\)\) \{.*?document\.body\.insertAdjacentHTML\('beforeend', modalHtml\);\n  \}"

new_modal = r"""if (!document.getElementById('assignUsersModal')) {
    const modalHtml = `
      <div id="assignUsersModal" class="modal">
        <div class="modal-content" style="max-width: 700px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <h2 style="margin: 0;">Manage Access: <span id="assignBucketName"></span></h2>
            <button class="close-btn" onclick="document.getElementById('assignUsersModal').classList.remove('active')" style="background: none; border: none; font-size: 1.5em; cursor: pointer; color: #fff;">&times;</button>
          </div>
          <input type="hidden" id="assignBucketId" />
          
          <div style="margin-bottom: 20px;">
            <h3 style="font-size: 1.1em; margin-bottom: 10px;">Assigned Users</h3>
            <div id="assignedUsersList">Loading...</div>
          </div>
          
          <hr style="border: 1px solid rgba(255,255,255,0.1); margin: 20px 0;">
          
          <div style="margin-bottom: 10px;">
            <h3 style="font-size: 1.1em; margin-bottom: 10px;">Assign New User</h3>
            <div class="form-group" style="display:flex; gap: 8px; align-items: end;">
              <div style="flex: 2;">
                <label>Search user</label>
                <input type="text" id="assignUserSearch" placeholder="Type a name or email..." onkeyup="window.filterBucketAssignUsers()" autocomplete="off" style="width:100%; padding: 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.2); color: white;" />
              </div>
              <div style="flex: 1; min-width: 120px;">
                <label>Role</label>
                <select id="assignRoleFilter" onchange="window.filterBucketAssignUsers()" style="width:100%; padding: 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.2); color: white;">
                  <option value="">All</option>
                  <option value="user">User</option>
                  <option value="fin">FIN</option>
                  <option value="fip">FIP</option>
                  <option value="fih">FIH</option>
                  <option value="oh">OH</option>
                  <option value="caoh">CAOH</option>
                </select>
              </div>
            </div>
            
            <div class="form-group">
              <label>Select user</label>
              <select id="assignUserSelect" style="width:100%; padding: 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.2); color: white;" onchange="window.renderSelectedUserAccess()">
                <option value="">Loading users...</option>
              </select>
            </div>
            
            <div id="assignUserAccessBox" style="margin-top: 16px; padding: 12px; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; background: rgba(255,255,255,0.02); display: none;">
              <div style="font-weight: 600; margin-bottom: 8px;">Permissions</div>
              <label style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                <input type="checkbox" id="assignCanViewBalance" /> View balance
              </label>
              <label style="display:flex; align-items:center; gap:8px;">
                <input type="checkbox" id="assignCanTransfer" /> Can transfer
              </label>
              <div style="display: flex; justify-content: flex-start; margin-top: 10px;">
                <button type="button" class="sq-btn primary" onclick="window.saveBucketAccess()">+ Assign User</button>
              </div>
            </div>
          </div>
          
          <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
            <button type="button" class="sq-btn secondary" onclick="document.getElementById('assignUsersModal').classList.remove('active')">Close</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  }"""
content = re.sub(old_modal, new_modal, content, flags=re.DOTALL)

# 3. Add window.renderAssignedUsers
new_funcs = r"""
window.renderAssignedUsers = function() {
  const list = document.getElementById('assignedUsersList');
  if (!list) return;
  const assigned = allAssignUsers.filter(u => u.is_assigned);
  if (assigned.length === 0) {
    list.innerHTML = '<p class="empty-state" style="margin:0;">No users assigned.</p>';
    return;
  }
  
  list.innerHTML = `
    <table style="width:100%; border-collapse: collapse; text-align: left; font-size: 0.9em;">
      <thead>
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.2);">
          <th style="padding: 8px;">User</th>
          <th style="padding: 8px; text-align: center;">View Balance</th>
          <th style="padding: 8px; text-align: center;">Can Transfer</th>
          <th style="padding: 8px; text-align: center;">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${assigned.map(u => `
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
            <td style="padding: 8px;">${escapeHtml(u.name || u.email)} <small style="color:#aaa;">(${escapeHtml(String(u.role).toUpperCase())})</small></td>
            <td style="padding: 8px; text-align: center;"><input type="checkbox" id="chk_view_${u.id}" ${u.can_view_balance ? 'checked' : ''} /></td>
            <td style="padding: 8px; text-align: center;"><input type="checkbox" id="chk_trans_${u.id}" ${u.can_transfer ? 'checked' : ''} /></td>
            <td style="padding: 8px; text-align: center;">
              <button onclick="window.saveRowAccess('${u.id}')" title="Save" style="background: none; border: none; color: #48bb78; cursor: pointer; font-size: 1.2em; margin-right: 12px;"><i class="fas fa-check-square"></i></button>
              <button onclick="window.removeRowAccess('${u.id}')" title="Remove" style="background: none; border: none; color: #f56565; cursor: pointer; font-size: 1.2em;"><i class="fas fa-times"></i></button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
};

window.saveRowAccess = async function(userId) {
  if (!currentAssignBucket || !userId) return;
  const can_view = !!document.getElementById(`chk_view_${userId}`)?.checked;
  const can_trans = !!document.getElementById(`chk_trans_${userId}`)?.checked;
  
  try {
    const payload = {
      bucket_id: currentAssignBucket,
      user_id: userId,
      can_transfer: can_trans,
      can_view_balance: can_view,
      assigned_by: state.user.id
    };
    const { error } = await supabaseClient.from('bucket_access').upsert([payload], { onConflict: 'bucket_id,user_id' });
    if (error) throw error;
    
    const user = allAssignUsers.find(u => u.id === userId);
    if (user) {
      user.can_transfer = can_trans;
      user.can_view_balance = can_view;
    }
    await loadOrgBuckets();
    window.renderAssignedUsers();
    showToast('Changes saved', 'success');
  } catch (err) {
    console.error(err);
    showToast('Failed to save changes.', 'error');
  }
};

window.removeRowAccess = async function(userId) {
  if (!currentAssignBucket || !userId) return;
  try {
    const { error } = await supabaseClient.from('bucket_access').delete().eq('bucket_id', currentAssignBucket).eq('user_id', userId);
    if (error) throw error;
    
    const user = allAssignUsers.find(u => u.id === userId);
    if (user) {
      user.is_assigned = false;
      user.can_transfer = false;
      user.can_view_balance = false;
    }
    await loadOrgBuckets();
    window.renderAssignedUsers();
    showToast('User removed', 'success');
  } catch (err) {
    console.error(err);
    showToast('Failed to remove user.', 'error');
  }
};
"""
content = content.replace("window.openAssignUsersModal = async function(bucketId, bucketName) {", new_funcs + "\nwindow.openAssignUsersModal = async function(bucketId, bucketName) {")

# 4. Make sure openAssignUsersModal calls renderAssignedUsers
old_open = r"if \(select && select\.innerHTML\.includes\('Step 8'\)\) select\.innerHTML = '<option value=\"\">Step 9: filter finished</option>';\n    \} catch \(err\) \{"
new_open = r"if (select && select.innerHTML.includes('Step 8')) select.innerHTML = '<option value=\"\">Step 9: filter finished</option>';\n      window.renderAssignedUsers();\n    } catch (err) {"
content = re.sub(old_open, new_open, content)

# 5. Fix saveBucketAccess so it just calls renderAssignedUsers and doesn't close modal
old_save_access = r"await loadOrgBuckets\(\);\n      document\.getElementById\('assignUsersModal'\)\.classList\.remove\('active'\);\n      showToast\('Bucket access saved', 'success'\);"
new_save_access = r"await loadOrgBuckets();\n      user.is_assigned = true;\n      window.renderAssignedUsers();\n      document.getElementById('assignUserAccessBox').style.display = 'none';\n      document.getElementById('assignUserSelect').value = '';\n      showToast('User assigned', 'success');"
content = re.sub(old_save_access, new_save_access, content)

with open('src/pages/buckets.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("UI updated to unified modal")
