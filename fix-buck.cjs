const fs = require('fs');
let code = fs.readFileSync('src/utils/navPermissions.js', 'utf8');
code = code.replace(
  'const OTM_HIDDEN_PAGES = new Set([',
  'const OTM_HIDDEN_PAGES = new Set([\n  \'buckets\','
);
code = code.replace(
  'const OHT_HIDDEN_PAGES = new Set([',
  'const OHT_HIDDEN_PAGES = new Set([\n  \'buckets\','
);
fs.writeFileSync('src/utils/navPermissions.js', code, 'utf8');
