const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');

code = code.replace(/â˜°/g, '☰');
code = code.replace(/â†’/g, '→');
code = code.replace(/â ³/g, '⏳');
code = code.replace(/â€”/g, '—');
code = code.replace(/âœ…/g, '✅');

fs.writeFileSync('src/main.js', code, 'utf8');
console.log('Fixed hamburger, arrows, hourglass, emdash, checkmark emojis');
