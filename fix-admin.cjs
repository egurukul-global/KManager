const fs = require('fs');

let code = fs.readFileSync('src/pages/user-mgmt.js', 'utf8');

// Add allowed_views to select
code = code.replace(
  ".select('id, email, name, role, on_hold, request_alias, gender')",
  ".select('id, email, name, role, on_hold, request_alias, gender, allowed_views')"
);

// Add checkboxes in HTML
const oldFormGroup = `              <div class="form-group">
                <label>Org role</label>
                <select id="editUserRole">\${roleOptions(user.role || 'user')}</select>
              </div>`;

const newFormGroup = `              <div class="form-group">
                <label>Org role</label>
                <select id="editUserRole">\${roleOptions(user.role || 'user')}</select>
              </div>
              <div class="form-group">
                <label>Allowed Views</label>
                <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:8px;">
                  <label><input type="checkbox" id="editViewTeam" checked disabled> Team (Required)</label>
                  <label><input type="checkbox" id="editViewManager" \${(user.allowed_views || []).includes('manager') ? 'checked' : ''}> Manager</label>
                  <label><input type="checkbox" id="editViewAdmin" \${(user.allowed_views || []).includes('admin') ? 'checked' : ''}> Admin</label>
                </div>
              </div>`;

if (code.includes(oldFormGroup)) {
  code = code.replace(oldFormGroup, newFormGroup);
} else {
  console.log('Failed to match form group for allowed_views');
}

// Add extraction in saveUserProfile
const oldSave = `  let role = String(document.getElementById('editUserRole')?.value || existing?.role || 'user').toLowerCase().trim();`;

const newSave = `  let role = String(document.getElementById('editUserRole')?.value || existing?.role || 'user').toLowerCase().trim();
  
  const allowedViews = ['team'];
  if (document.getElementById('editViewManager')?.checked) allowedViews.push('manager');
  if (document.getElementById('editViewAdmin')?.checked) allowedViews.push('admin');`;

if (code.includes(oldSave)) {
  code = code.replace(oldSave, newSave);
}

// Add to update
const oldUpdate = `.update({ name, role, on_hold })`;
const newUpdate = `.update({ name, role, on_hold, allowed_views: allowedViews })`;

if (code.includes(oldUpdate)) {
  code = code.replace(oldUpdate, newUpdate);
}

const oldAllDataUpdate = `allUsersData[idx] = { ...allUsersData[idx], name, role, on_hold };`;
const newAllDataUpdate = `allUsersData[idx] = { ...allUsersData[idx], name, role, on_hold, allowed_views: allowedViews };`;

if (code.includes(oldAllDataUpdate)) {
  code = code.replace(oldAllDataUpdate, newAllDataUpdate);
}

fs.writeFileSync('src/pages/user-mgmt.js', code, 'utf8');
console.log('Updated user-mgmt.js with allowed_views checkboxes');
