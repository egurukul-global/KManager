const fs = require('fs');
let code = fs.readFileSync('src/pages/income.js', 'utf8');
const targetStr = `    const container = document.getElementById('editIncomeAllocationsContainer');
    container.innerHTML = '';
    const plans = await getBudgetPlansForTeam();
    const allocs = rec.budget_allocations || [];
    allocs.forEach(a => {
      const plan = plans.find(p => p.id === a.budget_id);
      appendAllocationSummaryRow(container, a.budget_id, a.amount_usd, plan ? plan.name : 'Unknown Plan', true);
    });`;

if (code.includes(targetStr)) {
    code = code.replace(targetStr, '/* ' + targetStr + ' */');
    fs.writeFileSync('src/pages/income.js', code, 'utf8');
    console.log('Fixed editIncomeAllocationsContainer error');
} else {
    console.log('Target string not found');
}
