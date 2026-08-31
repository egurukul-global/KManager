const fs = require('fs');
let code = fs.readFileSync('src/pages/expenses.js', 'utf8');
const lines = code.split('\n');
lines.forEach((l, i) => {
  if (l.includes('is_frozen')) console.log((i+1)+': '+l);
});
