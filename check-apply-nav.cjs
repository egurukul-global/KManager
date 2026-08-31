const fs = require('fs');
const lines = fs.readFileSync('src/utils/navPermissions.js', 'utf8').split('\n');
const start = lines.findIndex(l => l.includes('export function applyNavPermissions'));
if (start !== -1) {
  for (let i = start; i < start + 30; i++) console.log((i+1) + ': ' + lines[i]);
}
