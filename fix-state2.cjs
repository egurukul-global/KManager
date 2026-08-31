const fs = require('fs');
let code = fs.readFileSync('src/state.js', 'utf8');
code = code.replace(
  `activeViewContext: localStorage.getItem('kmanager_view_mode') || 'team',`,
  `activeViewContext: localStorage.getItem('kmanager_view_mode') || null,`
);
fs.writeFileSync('src/state.js', code, 'utf8');
