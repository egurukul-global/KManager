const fs = require('fs');
let code = fs.readFileSync('src/utils/navPermissions.js', 'utf8');

const regexAllow = /const OTM_ALLOWED_PAGES = new Set\(\[\n  'dashboard',\n  'profile',\n  'approval-portal',\n  'buckets',/m;
const newAllow = `const OTM_ALLOWED_PAGES = new Set([\n  'dashboard',\n  'profile',\n  'approval-portal',`;

if (regexAllow.test(code)) {
  code = code.replace(regexAllow, newAllow);
  fs.writeFileSync('src/utils/navPermissions.js', code, 'utf8');
  console.log('Removed buckets from OTM_ALLOWED_PAGES');
} else {
  console.log('Regex failed');
}
