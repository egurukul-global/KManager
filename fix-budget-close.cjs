const fs = require('fs');
let code = fs.readFileSync('src/pages/budgets.js', 'utf8');

const regex = /const newStatus = document\.getElementById\('editBudgetStatus'\)\.value;/;
const replacement = `const newStatus = document.getElementById('editBudgetStatus').value;
  
  if (newStatus === 'archived' || newStatus === 'closed') {
    const { data: unreviewed, error: expErr } = await window.supabaseClient
      .from('expenses')
      .select('id')
      .eq('budget_id', id)
      .eq('is_deleted', false)
      .eq('is_reviewed', false)
      .limit(1);
    
    if (unreviewed && unreviewed.length > 0) {
      showToast('Cannot close budget: All logged expenses must be reviewed by Finance first.', 'error');
      return;
    }
  }`;

code = code.replace(regex, replacement);
fs.writeFileSync('src/pages/budgets.js', code);
