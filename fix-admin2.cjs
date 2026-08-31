const fs = require('fs');
let code = fs.readFileSync('src/pages/user-mgmt.js', 'utf8');

const regex = /<label>Org role<\/label>\s*<select id="editUserRole">\$\{roleOptions\(user\.role \|\| 'user'\)\}<\/select>\s*<\/div>/m;
const replacement = `<label>Org role</label>
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

if (regex.test(code)) {
  code = code.replace(regex, replacement);
  fs.writeFileSync('src/pages/user-mgmt.js', code, 'utf8');
  console.log('Fixed HTML injection for Allowed Views');
} else {
  console.log('Regex failed again');
}
