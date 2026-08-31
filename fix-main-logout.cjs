const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');
code = code.replace(/state\.user = null;/, "state.user = null;\n  sessionStorage.removeItem('kmanager_view_mode');\n  localStorage.removeItem('kmanager_view_mode');");
fs.writeFileSync('src/main.js', code);
