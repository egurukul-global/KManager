const fs = require('fs');
let code = fs.readFileSync('src/utils/navPermissions.js', 'utf8');

code = code.replace(
  /const isFin = \['admin', 'caoh', 'oh', 'ceo', 'fin', 'fip'\]\.includes\(r\);/g,
  "const isFin = ['admin', 'caoh', 'oh', 'ceo', 'fin', 'fip', 'fih'].includes(r);"
);

fs.writeFileSync('src/utils/navPermissions.js', code, 'utf8');
