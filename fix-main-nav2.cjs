const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');
const lines = code.split('\n');
lines.splice(400, 5); // Remove lines 401-405
fs.writeFileSync('src/main.js', lines.join('\n'), 'utf8');
