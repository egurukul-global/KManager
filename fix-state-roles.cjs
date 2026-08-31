const fs = require('fs');
let code = fs.readFileSync('src/state.js', 'utf8');

const regex = /if \(\['admin', 'fih', 'fin', 'fip', 'cao'\]\.includes\(role\)\) \{\n    state\.canTransferFunds = true;\n    state\.canManageIncome = true;\n  \}/;

code = code.replace(regex, "");
fs.writeFileSync('src/state.js', code);
