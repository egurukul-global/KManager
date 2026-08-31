const fs = require('fs');
let code = fs.readFileSync('src/pages/buckets.js', 'utf8');

const injectModalCode = `
// Inject Assign Users Modal
if (!document.getElementById('assignUsersModal')) {
  const modalHtml = \`
    <div id="assignUsersModal" class="modal">
      <div class="modal-content" style="max-width: 500px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h2 style="margin: 0;">Assign Users to <span id="assignBucketName"></span></h2>
          <button class="close-btn" onclick="document.getElementById('assignUsersModal').classList.remove('active')" style="background: none; border: none; font-size: 1.5em; cursor: pointer; color: #fff;">&times;</button>
        </div>
        <input type="hidden" id="assignBucketId" />
        
        <div class="form-group" style="display:flex; gap: 8px;">
          <input type="text" id="assignUserSearch" placeholder="Search user by name..." style="flex: 2; padding: 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.2); color: white;" onkeyup="window.filterAssignUsers()" />
          <select id="assignRoleFilter" style="flex: 1; padding: 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.2); color: white;" onchange="window.filterAssignUsers()">
            <option value="">All Roles</option>
            <option value="user">User</option>
            <option value="fin">FIN</option>
            <option value="fip">FIP</option>
            <option value="oh">OH / FIH</option>
          </select>
        </div>

        <div id="assignUsersList" style="max-height: 300px; overflow-y: auto; margin-bottom: 20px; border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; padding: 8px;">
          Loading users...
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <button class="sq-btn secondary" onclick="document.getElementById('assignUsersModal').classList.remove('active')">Close</button>
        </div>
      </div>
    </div>
  \`;
  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

let allAssignUsers = [];
let currentAssignBucket = null;

window.openAssignUsersModal = async function(bucketId, bucketName) {
  currentAssignBucket = bucketId;
  document.getElementById('assignBucketId').value = bucketId;
  document.getElementById('assignBucketName').textContent = bucketName;
  document.getElementById('assignUsersModal').classList.add('active');
  document.getElementById('assignUsersList').innerHTML = 'Loading users...';
  
  try {
    const { data: usersData } = await supabaseClient.from('users').select('id, name, email, role').order('name');
    const { data: accessData } = await supabaseClient.from('bucket_access').select('user_id').eq('bucket_id', bucketId);
    
    const assignedIds = new Set(accessData?.map(a => a.user_id) || []);
    allAssignUsers = usersData.map(u => ({ ...u, assigned: assignedIds.has(u.id) }));
    
    window.filterAssignUsers();
  } catch (err) {
    console.error(err);
    document.getElementById('assignUsersList').innerHTML = 'Error loading users.';
  }
};

window.filterAssignUsers = function() {
  const q = document.getElementById('assignUserSearch').value.toLowerCase();
  const role = document.getElementById('assignRoleFilter').value.toLowerCase();
  
  const filtered = allAssignUsers.filter(u => {
    const nameMatch = (u.name || u.email || '').toLowerCase().includes(q);
    const roleMatch = !role || (u.role || '').toLowerCase() === role;
    return nameMatch && roleMatch;
  });
  
  const list = document.getElementById('assignUsersList');
  if (filtered.length === 0) {
    list.innerHTML = '<div style="color: #888; text-align: center; padding: 10px;">No matching users.</div>';
    return;
  }
  
  list.innerHTML = filtered.map(u => \`
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; border-bottom: 1px solid rgba(255,255,255,0.05);">
      <div>
        <div style="font-weight: bold;">\${escapeHtml(u.name || u.email)}</div>
        <div style="font-size: 0.8em; color: #888;">Role: \${escapeHtml((u.role || 'user').toUpperCase())}</div>
      </div>
      <button class="sq-btn \${u.assigned ? 'danger' : 'success'}" 
              onclick="window.toggleUserBucketAccess('\${u.id}', \${u.assigned})"
              style="padding: 4px 12px; height: auto;">
        \${u.assigned ? 'Remove' : 'Assign'}
      </button>
    </div>
  \`).join('');
};

window.toggleUserBucketAccess = async function(userId, isCurrentlyAssigned) {
  try {
    if (isCurrentlyAssigned) {
      await supabaseClient.from('bucket_access').delete().eq('bucket_id', currentAssignBucket).eq('user_id', userId);
    } else {
      await supabaseClient.from('bucket_access').insert([{
        bucket_id: currentAssignBucket,
        user_id: userId,
        assigned_by: state.user.id
      }]);
    }
    
    const user = allAssignUsers.find(u => u.id === userId);
    if (user) user.assigned = !isCurrentlyAssigned;
    
    window.filterAssignUsers();
    await loadOrgBuckets(); // Refresh the background list
  } catch (err) {
    console.error(err);
    showToast('Failed to update access.', 'error');
  }
};
`;

code += injectModalCode;
fs.writeFileSync('src/pages/buckets.js', code, 'utf8');
