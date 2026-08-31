const fs = require('fs');
const lines = fs.readFileSync('src/main.js', 'utf8').split('\n');
lines.forEach((l, i) => { if(l.includes('data-page="transfer"')) console.log(i+1, l); });
