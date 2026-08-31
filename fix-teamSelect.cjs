const fs = require('fs');
const lines = fs.readFileSync('src/utils/teamAccess.js', 'utf8').split('\n');
const start = lines.findIndex(l => l.includes("getElementById('teamSelect')"));
if (start !== -1) {
  for (let i = start - 5; i < start + 20; i++) console.log((i+1) + ': ' + lines[i]);
}
