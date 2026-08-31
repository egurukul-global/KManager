const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');
const lines = code.split('\n');
const start = lines.findIndex(l => l.includes('financial-status'));
if (start !== -1) {
  for(let i=start-10; i<start+20; i++) console.log((i+1)+': '+lines[i]);
}
