const fs = require('fs');
let code = fs.readFileSync('src/utils/navPermissions.js', 'utf8');

const target = `  const adminNav = document.getElementById('adminNav');
  if (adminNav) {
    const showAdmin = isSystemAdmin() || isOrgAdmin() || state.canManageTeamRoster;
    adminNav.style.display = showAdmin ? '' : 'none';
  }`;

const newCode = `  const adminNav = document.getElementById('adminNav');
  if (adminNav) {
    const showAdmin = isSystemAdmin() || isOrgAdmin() || state.canManageTeamRoster;
    // Context-Based View Architecture: Only show Admin nav if they are in 'admin' mode
    adminNav.style.display = (showAdmin && allowedViewSections.has('admin')) ? '' : 'none';
  }`;

code = code.replace(target, newCode);

fs.writeFileSync('src/utils/navPermissions.js', code, 'utf8');
