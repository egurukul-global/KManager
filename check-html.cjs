const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');
const lines = code.split('\n');
const start = lines.findIndex(l => l.includes('manager-expenses'));
if (start !== -1) {
  for(let i=start-5; i<start+5; i++) console.log((i+1)+': '+lines[i]);
} else { console.log('NOT FOUND'); }
