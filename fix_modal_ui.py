with open('src/pages/buckets.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update the assignUserAccessBox HTML in the modal template
old_access_box = """<div id="assignUserAccessBox" style="margin-top: 16px; padding: 12px; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; background: rgba(255,255,255,0.02); display: none;">
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
          </div>"""

new_access_box = """<div id="assignUserAccessBox" style="margin-top: 10px; display: none;">
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; background: rgba(255,255,255,0.02);">
                <div style="display: flex; gap: 16px; align-items: center;">
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
                </div>
              </div>
            </div>
          </div>
          
          <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px;">
            <button type="button" class="sq-btn secondary" style="padding: 6px 16px; font-size: 0.9em;" onclick="document.getElementById('assignUsersModal').classList.remove('active')">Close</button>
          </div>"""

content = content.replace(old_access_box, new_access_box)


# 2. Update window.renderAssignedUsers HTML
old_render = """<table style="width:100%; border-collapse: collapse; text-align: left; font-size: 0.9em;">
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
    </table>"""

new_render = """<table style="width:100%; border-collapse: collapse; text-align: left; font-size: 0.85em;">
      <thead>
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.2);">
          <th style="padding: 4px;">User</th>
          <th style="padding: 4px; text-align: center;">View Balance</th>
          <th style="padding: 4px; text-align: center;">Can Transfer</th>
          <th style="padding: 4px; text-align: center;">Save</th>
          <th style="padding: 4px; text-align: center;">Delete</th>
        </tr>
      </thead>
      <tbody>
        ${assigned.map(u => `
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
            <td style="padding: 4px;">${escapeHtml(u.name || u.email)} <small style="color:#aaa;">(${escapeHtml(String(u.role).toUpperCase())})</small></td>
            <td style="padding: 4px; text-align: center;"><input type="checkbox" id="chk_view_${u.id}" ${u.can_view_balance ? 'checked' : ''} /></td>
            <td style="padding: 4px; text-align: center;"><input type="checkbox" id="chk_trans_${u.id}" ${u.can_transfer ? 'checked' : ''} /></td>
            <td style="padding: 4px; text-align: center;">
              <button onclick="window.saveRowAccess('${u.id}')" title="Save" style="background: none; border: none; color: #48bb78; cursor: pointer; font-size: 1.2em;"><i class="fas fa-check-square"></i></button>
            </td>
            <td style="padding: 4px; text-align: center;">
              <button onclick="window.removeRowAccess('${u.id}')" title="Remove" style="background: none; border: none; color: #f56565; cursor: pointer; font-size: 1.2em;"><i class="fas fa-times"></i></button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>"""

content = content.replace(old_render, new_render)

with open('src/pages/buckets.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("UI layout tightened up")
