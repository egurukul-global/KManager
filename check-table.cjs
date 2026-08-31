const fs = require('fs');
let code = fs.readFileSync('src/pages/manager-finance.js', 'utf8');
const lines = code.split('\n');
const start = lines.findIndex(l => l.includes('<table class="data-table"'));
if (start !== -1) {
  for (let i = start - 5; i < start + 25; i++) console.log((i+1) + ': ' + lines[i]);
}
