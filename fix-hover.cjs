const fs = require('fs');
let code = fs.readFileSync('src/pages/manager-finance.js', 'utf8');

code = code.replace(
  `id="finTeamDropdown" style="`,
  `id="finTeamDropdown" onmouseleave="this.style.display='none'" style="`
);
code = code.replace(
  `id="finBudgetDropdown" style="`,
  `id="finBudgetDropdown" onmouseleave="this.style.display='none'" style="`
);

fs.writeFileSync('src/pages/manager-finance.js', code, 'utf8');
