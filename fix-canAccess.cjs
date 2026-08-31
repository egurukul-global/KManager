const fs = require('fs');
let code = fs.readFileSync('src/utils/navPermissions.js', 'utf8');

const oldCheck = `if (pageName === 'manager-finance' && isFin) return true;`;
const newCheck = `if ((pageName === 'manager-finance' || pageName === 'transfer') && isFin) return true;`;

code = code.replace(oldCheck, newCheck);
fs.writeFileSync('src/utils/navPermissions.js', code, 'utf8');
console.log('Fixed canAccessPage');
