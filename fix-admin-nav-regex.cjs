const fs = require('fs');
let code = fs.readFileSync('src/utils/navPermissions.js', 'utf8');

const regex = /const adminNav = document\.getElementById\('adminNav'\);[\s\S]*?adminNav\.style\.display = showAdmin \? '' : 'none';\s*\}/;

const newCode = `const adminNav = document.getElementById('adminNav');
  if (adminNav) {
    const showAdmin = isSystemAdmin() || isOrgAdmin() || state.canManageTeamRoster;
    // Context-Based View Architecture: Only show Admin nav if they are in 'admin' mode
    adminNav.style.display = (showAdmin && allowedViewSections.has('admin')) ? '' : 'none';
  }`;

if (regex.test(code)) {
  code = code.replace(regex, newCode);
  fs.writeFileSync('src/utils/navPermissions.js', code, 'utf8');
  console.log('Successfully updated navPermissions.js');
} else {
  console.log('Failed to match regex in navPermissions.js');
}
