const fs = require('fs');
let code = fs.readFileSync('src/pages/transfer.js', 'utf8');

const regex = /if \(isTeamLeadAccess\(state\)\) \{/;
const replacement = `if (isTeamLeadAccess(state) || ['admin', 'ceo', 'caoh', 'oh', 'fin', 'fip'].includes(String(state.user?.role || '').toLowerCase())) {`;

code = code.replace(regex, replacement);
fs.writeFileSync('src/pages/transfer.js', code, 'utf8');
