const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');
code = code.replace(/localStorage\.setItem\('kmanager_view_mode', viewMode\);/, "sessionStorage.setItem('kmanager_view_mode', viewMode);");
fs.writeFileSync('src/main.js', code);
