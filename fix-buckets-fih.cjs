const fs = require('fs');
let code = fs.readFileSync('src/pages/buckets.js', 'utf8');

code = code.replace(
  /if \(\['admin', 'ceo', 'caoh', 'oh'\]\.includes\(role\)\) \{/,
  "if (['admin', 'ceo', 'caoh', 'oh', 'fih'].includes(role)) {"
);

fs.writeFileSync('src/pages/buckets.js', code, 'utf8');
