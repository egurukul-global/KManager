const fs = require('fs');
let code = fs.readFileSync('src/pages/transfer.js', 'utf8');

code = code.replace(
  `if (isTeamLeadAccess(state) || ['admin', 'ceo', 'caoh', 'oh', 'fin', 'fip'].includes(String(state.user?.role || '').toLowerCase())) {`,
  `if (isTeamLeadAccess(state) || hasAnyGlobalFinanceRole() || ['admin', 'ceo', 'caoh', 'oh', 'fin', 'fip'].includes(String(state.user?.role || '').toLowerCase())) {`
);

code = code.replace(
  `const lead = isTeamLeadAccess(state) || hasAnyGlobalFinanceRole();\n\n    return \`\n      <h1 class="page-title">Unified Transfers</h1>`,
  `const lead = isTeamLeadAccess(state) || hasAnyGlobalFinanceRole();\n\n    return \`\n      <h1 class="page-title">Unified Transfers</h1>`
);

fs.writeFileSync('src/pages/transfer.js', code);
console.log('Fixed more roles');
