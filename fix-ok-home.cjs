const fs = require('fs');
let code = fs.readFileSync('src/pages/ok-home.js', 'utf8');
code = code.replace(/async function loadNotifications\(\) \{/, 'async function loadNotifications() {\n  if (!state.user) return;');
fs.writeFileSync('src/pages/ok-home.js', code);
