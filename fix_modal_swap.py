with open('src/pages/buckets.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Swap the blocks and move the close button
old_modal = """<div class="modal-content" style="max-width: 700px;">
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
            
            <div id="assignUserAccessBox" style="margin-top: 10px; display: none;">
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; background: rgba(255,255,255,0.02); flex-wrap: wrap; gap: 8px;">
                <div style="display: flex; gap: 16px; align-items: center; flex-wrap: wrap;">
                  <span style="font-weight: 600; font-size: 0.9em;">Permissions:</span>
                  <label style="display:flex; align-items:center; gap:4px; margin:0; font-size: 0.9em;">
                    <input type="checkbox" id="assignCanViewBalance" /> View balance
                  </label>
                  <label style="display:flex; align-items:center; gap:4px; margin:0; font-size: 0.9em;">
                    <input type="checkbox" id="assignCanTransfer" /> Can transfer
                  </label>
                </div>
                <div style="display: flex; gap: 8px;">
                  <button type="button" class="sq-btn primary" style="padding: 4px 12px; font-size: 0.85em;" onclick="window.saveBucketAccess()">+ Assign</button>
                  <button type="button" class="sq-btn secondary" style="padding: 4px 12px; font-size: 0.85em;" onclick="document.getElementById('assignUsersModal').classList.remove('active')">Close</button>
                </div>
              </div>
            </div>
          </div>
        </div>"""

new_modal = """<div class="modal-content" style="max-width: 700px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <h2 style="margin: 0; font-size: 1.3em;">Manage Access: <span id="assignBucketName"></span></h2>
            <button type="button" class="sq-btn secondary" style="padding: 6px 16px; font-size: 0.9em;" onclick="document.getElementById('assignUsersModal').classList.remove('active')">Close</button>
          </div>
          <input type="hidden" id="assignBucketId" />
          
          <div style="margin-bottom: 20px;">
            <h3 style="font-size: 1.0em; margin-bottom: 10px;">Assign New User</h3>
            <div class="form-group" style="display:flex; gap: 8px; align-items: end; flex-wrap: wrap;">
              <div style="flex: 2; min-width: 200px;">
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
            
            <div id="assignUserAccessBox" style="margin-top: 10px; display: none;">
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; background: rgba(255,255,255,0.02); flex-wrap: wrap; gap: 8px;">
                <div style="display: flex; gap: 16px; align-items: center; flex-wrap: wrap;">
                  <span style="font-weight: 600; font-size: 0.9em;">Permissions:</span>
                  <label style="display:flex; align-items:center; gap:4px; margin:0; font-size: 0.9em;">
                    <input type="checkbox" id="assignCanViewBalance" /> View balance
                  </label>
                  <label style="display:flex; align-items:center; gap:4px; margin:0; font-size: 0.9em;">
                    <input type="checkbox" id="assignCanTransfer" /> Can transfer
                  </label>
                </div>
                <div style="display: flex; gap: 8px;">
                  <button type="button" class="sq-btn primary" style="padding: 4px 12px; font-size: 0.85em;" onclick="window.saveBucketAccess()">+ Assign User</button>
                </div>
              </div>
            </div>
          </div>
          
          <hr style="border: 1px solid rgba(255,255,255,0.1); margin: 20px 0;">
          
          <div style="margin-bottom: 20px;">
            <h3 style="font-size: 1.0em; margin-bottom: 10px;">Assigned Users</h3>
            <div id="assignedUsersList">Loading...</div>
          </div>
        </div>"""

content = content.replace(old_modal, new_modal)

with open('src/pages/buckets.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Modal swapped")
