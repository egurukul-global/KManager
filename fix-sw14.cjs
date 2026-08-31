const fs = require('fs');
let code = fs.readFileSync('public/sw.js', 'utf8');
code = code.replace(/const CACHE_NAME = 'kmanager-v.*?';/, "const CACHE_NAME = 'kmanager-v14';");
fs.writeFileSync('public/sw.js', code, 'utf8');
