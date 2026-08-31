const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');

// The corrupted line is: <span class="icon">[gear][FE0F][C28F]</span>
const badGear = Buffer.from('e29a99efb88fc28f', 'hex').toString('utf8');
const goodGear = Buffer.from('e29a99efb88f20', 'hex').toString('utf8'); // gear + space

code = code.replace(badGear, goodGear);
fs.writeFileSync('src/main.js', code, 'utf8');
console.log('Fixed gear icon');
