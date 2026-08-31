const fs = require('fs');
const lines = fs.readFileSync('src/main.js', 'utf8').split('\n');
const start = lines.findIndex(l => l.includes('data-page="transfer"'));
if (start !== -1) {
  console.log(lines[start]);
}
