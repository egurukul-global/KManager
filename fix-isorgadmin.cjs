const fs = require('fs');
let code = fs.readFileSync('src/utils/navPermissions.js', 'utf8');

code = code.replace(
  /return \['admin', 'caoh', 'oh', 'ceo'\]\.includes\(state\.user\?\.role\);/,
  "return ['admin', 'caoh', 'oh', 'ceo', 'fih'].includes(state.user?.role);"
);

fs.writeFileSync('src/utils/navPermissions.js', code, 'utf8');
