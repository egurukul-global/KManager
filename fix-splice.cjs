const fs = require('fs');
let code = fs.readFileSync('src/pages/manager-finance.js', 'utf8');
const lines = code.split('\n');

lines.splice(207, 8,
  "    const tbody = document.getElementById('financeDashboardTableBody');",
  "    if (tbody) tbody.innerHTML = '<tr><td colspan=\"6\" style=\"color:var(--error);\">Failed to load reconciliation data.</td></tr>';"
);

code = lines.join('\n');
fs.writeFileSync('src/pages/manager-finance.js', code);
