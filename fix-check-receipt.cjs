const fs = require('fs');
let code = fs.readFileSync('src/pages/expenses.js', 'utf8');

const jsRegex = /window\.checkReceiptForReview = [\s\S]*?\n\};/g;
code = code.replace(jsRegex, ''); // clear if already exists

const jsToInsert = `
window.checkReceiptForReview = function(prefix) {
  const url = document.getElementById(prefix === 'add' ? 'expReceiptUrl' : 'editExpReceiptUrl').value;
  const cb = document.getElementById(prefix === 'add' ? 'expSubmitReview' : 'editExpSubmitReview');
  const hint = document.getElementById(prefix === 'add' ? 'expSubmitHint' : 'editExpSubmitHint');
  
  if (!cb) return;
  
  if (url && url.trim().length > 0) {
    cb.disabled = false;
    cb.checked = true;
    hint.style.display = 'none';
  } else {
    cb.disabled = true;
    cb.checked = false;
    hint.style.display = 'block';
  }
};
`;

const targetIndex = code.indexOf('function editExpense(');
code = code.slice(0, targetIndex) + jsToInsert + '\n' + code.slice(targetIndex);

fs.writeFileSync('src/pages/expenses.js', code);
