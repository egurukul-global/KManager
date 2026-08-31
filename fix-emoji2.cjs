const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');
code = code.replace(/ðŸŸ¢|dYY/g, '🟢');
code = code.replace(/ðŸ”´|dY”´/g, '🔴');
code = code.replace(/ðŸŸ¡|dYY¡/g, '🟡');
fs.writeFileSync('src/main.js', code, 'utf8');
console.log('Fixed status emojis');
