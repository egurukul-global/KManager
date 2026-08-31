const fs = require('fs');
let code = fs.readFileSync('src/utils/teamAccess.js', 'utf8');

const regex = /const isGlobalFromUserRole = \['caoh', 'oh', 'ceo'\]\.includes\(userRole\);/;
const newLogic = `const isGlobalFromUserRole = ['caoh', 'oh', 'ceo', 'fih', 'fin', 'fip', 'cao'].includes(userRole);`;

code = code.replace(regex, newLogic);
fs.writeFileSync('src/utils/teamAccess.js', code);
