const fs = require('fs');
let code = fs.readFileSync('src/utils/teamAccess.js', 'utf8');

const oldAllowed = `    if (typeof allowed === 'string') allowed = allowed.replace(/[{}]/g, '').split(',');`;
const newAllowed = `    if (typeof allowed === 'string') {
      try {
        const parsed = JSON.parse(allowed);
        if (Array.isArray(parsed)) allowed = parsed;
        else allowed = allowed.replace(/[{}]/g, '').replace(/"/g, '').split(',').map(s => s.trim());
      } catch (e) {
        allowed = allowed.replace(/[{}]/g, '').replace(/"/g, '').split(',').map(s => s.trim());
      }
    }`;

if (code.includes(oldAllowed)) {
  code = code.replace(oldAllowed, newAllowed);
  fs.writeFileSync('src/utils/teamAccess.js', code, 'utf8');
  console.log('Fixed allowed_views parser');
} else {
  console.log('Regex failed');
}
