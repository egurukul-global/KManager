const fs = require('fs');
const lines = fs.readFileSync('src/main.js', 'utf8').split('\n');
const start = lines.findIndex(l => l.includes('data-section="admin"'));
if (start !== -1) {
  for (let i = start - 2; i < start + 10; i++) console.log((i+1) + ': ' + lines[i]);
}
