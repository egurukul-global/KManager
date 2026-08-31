const fs = require('fs');
let code = fs.readFileSync('src/pages/expenses.js', 'utf8');

const regex = /function canEditExpense\(expense\) \{[\s\S]*?\n\}/;
const newCode = `function canEditExpense(expense) {
  if (expense && expense.is_reviewed) return false;
  if (state.isReadOnlyTeamAccess) return false;
  if (expense.is_frozen) return false;
  
  // Team Leads and Admins can edit anything that isn't locked
  if (state.canManageExpenses && state.canViewAllExpenses) return true;
  
  // Members can edit their own expenses
  return expense.created_by === state.user?.id;
}`;

code = code.replace(regex, newCode);
fs.writeFileSync('src/pages/expenses.js', code);
