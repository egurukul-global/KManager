const fs = require('fs');
let code = fs.readFileSync('src/utils/navPermissions.js', 'utf8');

code = code.replace(
  /document\.querySelectorAll\('\.nav-subitem\[data-page\]'\)\.forEach/g,
  "document.querySelectorAll('.nav-subitem[data-page], .nav-subitem-label[data-page]').forEach"
);

fs.writeFileSync('src/utils/navPermissions.js', code, 'utf8');
console.log('Fixed querySelectorAll in navPermissions');
