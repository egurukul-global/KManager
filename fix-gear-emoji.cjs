const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');
code = code.replace(/âš™ï¸/g, '⚙️');
code = code.replace(/dYš™ď¸Ź/g, '⚙️');
fs.writeFileSync('src/main.js', code, 'utf8');
console.log('Fixed gear emoji');
