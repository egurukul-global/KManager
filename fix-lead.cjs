const fs = require('fs');
let code = fs.readFileSync('src/utils/transferHelpers.js', 'utf8');

code = code.replace(
  /\[\'admin\', \'ceo\', \'caoh\', \'oh\', \'fin\', \'fip\'\]/g,
  "['admin', 'ceo', 'caoh', 'cao', 'oh', 'fih', 'fin', 'fip']"
);

fs.writeFileSync('src/utils/transferHelpers.js', code);
