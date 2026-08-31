const fs = require('fs');
const lines = fs.readFileSync('src/utils/navPermissions.js', 'utf8').split('\n');
lines.forEach((l, i) => { if(l.includes('transfer')) console.log(i+1, l); });
