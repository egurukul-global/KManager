const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');

code = code.replace(
  "clearTimeout(inactivityTimeout);",
  "clearTimeout(inactivityTimeout);\n  sessionStorage.removeItem('kmanager_view_mode');\n  state.activeViewContext = null;"
);

code = code.replace(
  "state.isReadOnlyTeamAccess = false;",
  "state.isReadOnlyTeamAccess = false;\n  sessionStorage.removeItem('kmanager_view_mode');\n  state.activeViewContext = null;"
); // for forceLogout, wait, let's find forceLogout

fs.writeFileSync('src/main.js', code);
