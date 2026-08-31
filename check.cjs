const fs = require('fs');
let text = fs.readFileSync('src/main.js', 'utf8');
const matches = text.match(/<span class="icon">.*?<\/span>/g);
if (matches) console.log(matches.slice(0, 15).join('\n'));
const arrows = text.match(/<span class="arrow">.*?<\/span>/g);
if (arrows) console.log(arrows.slice(0, 5).join('\n'));
