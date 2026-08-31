const fs = require('fs');
let code = fs.readFileSync('src/pages/expenses.js', 'utf8');

const regex = /window\.checkReceiptForReview = function\(prefix\) \{[\s\S]*?\n\};/g;
const replacement = `window.checkReceiptForReview = function(prefix, autoCheck = true) {
  const url = document.getElementById(prefix === 'add' ? 'expReceiptUrl' : 'editExpReceiptUrl').value;
  const cb = document.getElementById(prefix === 'add' ? 'expSubmitReview' : 'editExpSubmitReview');
  const hint = document.getElementById(prefix === 'add' ? 'expSubmitHint' : 'editExpSubmitHint');
  
  if (!cb) return;
  
  if (url && url.trim().length > 0) {
    cb.disabled = false;
    if (autoCheck) cb.checked = true;
    hint.style.display = 'none';
  } else {
    cb.disabled = true;
    cb.checked = false;
    hint.style.display = 'block';
  }
};`;

code = code.replace(regex, replacement);

const initRegex = /window\.checkReceiptForReview\('edit'\);/g;
const initReplacement = `window.checkReceiptForReview('edit', false);`;
code = code.replace(initRegex, initReplacement);

const inputRegex = /"window\.checkReceiptForReview\('edit'\)"/g;
const inputReplacement = `"window.checkReceiptForReview('edit', true)"`;
code = code.replace(inputRegex, inputReplacement);

fs.writeFileSync('src/pages/expenses.js', code);
