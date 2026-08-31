const fs = require('fs');

let navCode = fs.readFileSync('src/utils/navPermissions.js', 'utf8');

const regexOrphan = /\}\n\n  if \(level === 'member'\) \{\n    return OTM_ALLOWED_PAGES\.has\(pageName\);\n  \}\n\n  return true;\n\}/m;

if (regexOrphan.test(navCode)) {
  navCode = navCode.replace(regexOrphan, '}');
  fs.writeFileSync('src/utils/navPermissions.js', navCode, 'utf8');
  console.log('Fixed syntax error!');
} else {
  console.log('Regex failed');
}
