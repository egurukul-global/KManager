const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');
const lines = code.split('\n');
const start = lines.findIndex(l => l.includes('data-section="financials"'));
if (start !== -1) {
  for(let i=start-2; i<start+30; i++) console.log((i+1)+': '+lines[i]);
}
