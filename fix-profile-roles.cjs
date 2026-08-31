const fs = require('fs');
let code = fs.readFileSync('src/pages/profile.js', 'utf8');

code = code.replace(
  "const isManager = ['fin', 'fip'].includes(role);",
  "const isManager = ['fin', 'fip'].includes(role) || state.userTeamAccess?.access_level === 'lead';"
);
fs.writeFileSync('src/pages/profile.js', code, 'utf8');
