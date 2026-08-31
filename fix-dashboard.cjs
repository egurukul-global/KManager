const fs = require('fs');
let code = fs.readFileSync('src/pages/dashboard.js', 'utf8');

code = code.replace(
  "const remaining = totalReceived - totalExpenses;",
  "const remaining = totalReceived - allTimeExpenses;"
);

fs.writeFileSync('src/pages/dashboard.js', code);
