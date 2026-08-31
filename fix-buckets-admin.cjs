const fs = require('fs');
let code = fs.readFileSync('src/pages/buckets.js', 'utf8');

code = code.replace(/const isGlobalView = state\.activeViewContext === 'manager' \|\| state\.activeViewContext === 'admin';/, "const isGlobalView = state.activeViewContext === 'admin';");

fs.writeFileSync('src/pages/buckets.js', code, 'utf8');
