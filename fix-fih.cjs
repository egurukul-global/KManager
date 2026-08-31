const fs = require('fs');
let code = fs.readFileSync('src/utils/okAccess.js', 'utf8');
code = code.replace(
  "const globalRoles = ['admin', 'fin', 'fip', 'oh', 'caoh', 'cao', 'ceo'];", 
  "const globalRoles = ['admin', 'fin', 'fip', 'oh', 'caoh', 'cao', 'ceo', 'fih'];"
);
fs.writeFileSync('src/utils/okAccess.js', code);
