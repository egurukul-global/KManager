const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');

const target = `  const showAdminNav = ['admin', 'caoh', 'oh', 'ceo'].includes(state.user?.role) || state.canManageTeamRoster;
  if (showAdminNav) {
    const adminNav = document.getElementById('adminNav');
    if (adminNav) adminNav.style.display = 'block';
  }`;

code = code.replace(target, '');

fs.writeFileSync('src/main.js', code, 'utf8');
