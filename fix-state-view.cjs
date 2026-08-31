const fs = require('fs');
let code = fs.readFileSync('src/state.js', 'utf8');

if (!code.includes('activeViewContext')) {
  code = code.replace(
    `  currentTeam: null,`,
    `  currentTeam: null,\n  activeViewContext: localStorage.getItem('kmanager_view_mode') || 'team',`
  );
  fs.writeFileSync('src/state.js', code, 'utf8');
  console.log('Added activeViewContext to state.js');
}
