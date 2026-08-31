const fs = require('fs');
let code = fs.readFileSync('src/utils/okAccess.js', 'utf8');
const lines = code.split('\n');
lines.splice(100, 5);
fs.writeFileSync('src/utils/okAccess.js', lines.join('\n'));
