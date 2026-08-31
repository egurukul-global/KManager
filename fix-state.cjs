const fs = require('fs');
let code = fs.readFileSync('src/state.js', 'utf8');
code = code.replace(/localStorage\.getItem\('kmanager_view_mode'\)/, "sessionStorage.getItem('kmanager_view_mode')");
fs.writeFileSync('src/state.js', code);
