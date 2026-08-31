const fs = require('fs');
let code = fs.readFileSync('src/utils/teamAccess.js', 'utf8');

const oldAllowed = `const allowed = state.user?.allowed_views || ['team'];`;
const newAllowed = `let allowed = state.user?.allowed_views || ['team'];
    if (typeof allowed === 'string') allowed = allowed.replace(/[{}]/g, '').split(',');`;

if (code.includes(oldAllowed)) {
  code = code.replace(oldAllowed, newAllowed);
  fs.writeFileSync('src/utils/teamAccess.js', code, 'utf8');
  console.log('Fixed allowed_views parsing');
} else {
  console.log('Regex failed');
}
