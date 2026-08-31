const fs = require('fs');
let code = fs.readFileSync('src/pages/buckets.js', 'utf8');

code = code.replace(
  /const canManage = \['admin', 'ceo', 'caoh', 'oh'\]\.includes\(role\);/,
  "const canManage = ['admin', 'ceo', 'caoh', 'oh', 'fih'].includes(role);"
);

fs.writeFileSync('src/pages/buckets.js', code, 'utf8');
