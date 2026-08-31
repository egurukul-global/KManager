const fs = require('fs');
const lines = fs.readFileSync('src/pages/transfer.js', 'utf8').split('\n');

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('linked_budget_id: crossTeam ? crossBudgetId : null,')) {
    lines[i] = "    linked_budget_id: crossTeam ? crossBudgetId : (document.getElementById('trLinkedBudgetId')?.value || null),";
    break;
  }
}

fs.writeFileSync('src/pages/transfer.js', lines.join('\n'), 'utf8');
console.log('Fixed transfer payload via line number');
