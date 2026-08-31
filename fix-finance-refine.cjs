const fs = require('fs');
let code = fs.readFileSync('src/pages/manager-finance.js', 'utf8');

// 1. Remove ERROR option
code = code.replace(
  '<option value="ERROR">Error (Negative)</option>',
  ''
);

// 2. Change Actionable Queue button onclick
code = code.replace(
  `onclick="document.getElementById('finStatusFilter').value = 'ERROR'; window.renderFinanceTable();"`,
  `onclick="window._finFilterError = true; window.renderFinanceTable();"`
);

// 3. Clear window._finFilterError when standard filters change
code = code.replace(
  `window.updateFinFilterLabels = function() {`,
  `window.updateFinFilterLabels = function() {
  window._finFilterError = false;`
);
code = code.replace(
  `<select id="finStatusFilter" onchange="window.renderFinanceTable()">`,
  `<select id="finStatusFilter" onchange="window._finFilterError = false; window.renderFinanceTable()">`
);

// 4. Update renderFinanceTable to use window._finFilterError and treat OPEN as !== 0
const oldOpenFilter = `  if (statusFilter === 'OPEN') filtered = filtered.filter(b => b.remaining_held_balance > 0);
  if (statusFilter === 'CLOSED') filtered = filtered.filter(b => b.remaining_held_balance === 0);
  if (statusFilter === 'ERROR') filtered = filtered.filter(b => b.remaining_held_balance < 0);`;

const newOpenFilter = `  if (window._finFilterError) {
    filtered = filtered.filter(b => b.remaining_held_balance < 0);
  } else {
    if (statusFilter === 'OPEN') filtered = filtered.filter(b => b.remaining_held_balance !== 0);
    if (statusFilter === 'CLOSED') filtered = filtered.filter(b => b.remaining_held_balance === 0);
  }`;
code = code.replace(oldOpenFilter, newOpenFilter);

// 5. Fix transparency on dropdowns
code = code.replace(
  /id="finTeamDropdown" onmouseleave="this.style.display='none'" style="[^"]*background:var\(--card-bg\);/g,
  `id="finTeamDropdown" onmouseleave="this.style.display='none'" style="display:none; position:absolute; top:100%; left:0; right:0; background:var(--bg, #fff); border:1px solid var(--border); z-index:10; max-height:250px; overflow-y:auto; padding:8px; box-shadow:0 8px 16px rgba(0,0,0,0.5);"`
);
code = code.replace(
  /id="finBudgetDropdown" onmouseleave="this.style.display='none'" style="[^"]*background:var\(--card-bg\);/g,
  `id="finBudgetDropdown" onmouseleave="this.style.display='none'" style="display:none; position:absolute; top:100%; left:0; right:0; background:var(--bg, #fff); border:1px solid var(--border); z-index:10; max-height:250px; overflow-y:auto; padding:8px; box-shadow:0 8px 16px rgba(0,0,0,0.5);"`
);

fs.writeFileSync('src/pages/manager-finance.js', code, 'utf8');
console.log('Fixed transparency, removed negative option, and fixed error filter');
