const fs = require('fs');
let code = fs.readFileSync('src/state.js', 'utf8');

// I will just replace `state.canTransferFunds = level === 'member' || level === 'lead' || level === 'admin';`
code = code.replace(
  /state\.canTransferFunds = level === 'member' \|\| level === 'lead' \|\| level === 'admin';/g,
  "state.canTransferFunds = state.canTransferFunds || level === 'member' || level === 'lead' || level === 'admin';"
);

code = code.replace(
  /state\.canManageIncome = false;/g,
  "state.canManageIncome = state.canManageIncome || false;"
);

code = code.replace(
  /state\.canTransferFunds = false;/g,
  "state.canTransferFunds = state.canTransferFunds || false;"
);

fs.writeFileSync('src/state.js', code);
