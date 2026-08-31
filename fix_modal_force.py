with open('src/pages/buckets.js', 'r', encoding='utf-8') as f:
    content = f.read()

start_marker = "// Inject Assign Users Modal"
end_marker = "let allAssignUsers = [];"

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx != -1 and end_idx != -1:
    new_modal = """// Inject Assign Users Modal
  if (!document.getElementById('assignUsersModal')) {
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
  }

"""
    content = content[:start_idx] + new_modal + content[end_idx:]
    
    with open('src/pages/buckets.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Replaced modal HTML")
else:
    print(f"Could not find markers! start={start_idx}, end={end_idx}")
