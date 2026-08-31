const fs = require('fs');
let code = fs.readFileSync('src/pages/dashboard.js', 'utf8');

const regex = /const totalExpenses = expenses[\s\S]*?if \(expensesEl\) expensesEl\.textContent = formatUsd\(totalExpenses\);/;

const newLogic = `    const allTimeExpenses = expenses.reduce((sum, e) => sum + (parseFloat(e.usd_amount) || 0), 0);
    const expensesEl = document.getElementById('dashExpenses');
    if (expensesEl) expensesEl.textContent = formatUsd(allTimeExpenses);

    const bookedExpenses = expenses
      .filter(e => currentBudgetIds.has(e.budget_id))
      .reduce((sum, e) => sum + (parseFloat(e.usd_amount) || 0), 0);
    const bookedEl = document.getElementById('dashBooked');
    if (bookedEl) bookedEl.textContent = formatUsd(bookedExpenses);

    const outstanding = allocatedIncome - bookedExpenses;
    const outEl = document.getElementById('dashOutstanding');
    if (outEl) outEl.textContent = formatUsd(outstanding);`;

code = code.replace(regex, newLogic);

fs.writeFileSync('src/pages/dashboard.js', code);
