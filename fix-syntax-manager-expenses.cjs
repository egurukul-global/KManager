const fs = require('fs');
let code = fs.readFileSync('src/pages/manager-expenses.js', 'utf8');
const lines = code.split('\n');
const fixedLines = [];
let skip = false;
for (let i = 0; i < lines.length; i++) {
  if (i === 215) {
    skip = true;
  }
  if (skip && i === 237) {
    skip = false;
    continue;
  }
  if (!skip) {
    fixedLines.push(lines[i]);
  }
}
fs.writeFileSync('src/pages/manager-expenses.js', fixedLines.join('\n'));
