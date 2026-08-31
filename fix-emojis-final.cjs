const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');

code = code.replace(/ðŸ”’/g, '🔒');
code = code.replace(/ðŸ”µ/g, '🔵');
code = code.replace(/âšª/g, '⚪');

fs.writeFileSync('src/main.js', code, 'utf8');
console.log('Fixed lock and circle emojis');
