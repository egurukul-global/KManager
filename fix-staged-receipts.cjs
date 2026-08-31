const fs = require('fs');
let code = fs.readFileSync('src/pages/expenses.js', 'utf8');

const regex = /window\.checkReceiptForReview = function\(prefix, autoCheck = true\) \{[\s\S]*?\n\};/;
const newCode = `window.checkReceiptForReview = function(prefix, autoCheck = true) {
  const url = document.getElementById(prefix === 'add' ? 'expReceiptUrl' : 'editExpReceiptUrl')?.value;
  const cb = document.getElementById(prefix === 'add' ? 'expSubmitReview' : 'editExpSubmitReview');
  const hint = document.getElementById(prefix === 'add' ? 'expSubmitHint' : 'editExpSubmitHint');
  
  if (!cb) return;
  
  const hasUrl = url && url.trim().length > 0;
  const hasStaged = typeof stagedAttachments !== 'undefined' && stagedAttachments.length > 0;
  
  if (hasUrl || hasStaged) {
    cb.disabled = false;
    if (autoCheck) cb.checked = true;
    if (hint) hint.style.display = 'none';
  } else {
    cb.disabled = true;
    cb.checked = false;
    if (hint) hint.style.display = 'block';
  }
};`;

code = code.replace(regex, newCode);

// Also need to call window.checkReceiptForReview('add', true) when a file is uploaded
code = code.replace(/stagedAttachments\.push\(\{ id: crypto\.randomUUID\(\), file_url: key, unsaved: true \}\);/g, 
  `stagedAttachments.push({ id: crypto.randomUUID(), file_url: key, unsaved: true });
  window.checkReceiptForReview('add', true);
  window.checkReceiptForReview('edit', true);`);
  
code = code.replace(/stagedAttachments = stagedAttachments\.filter\(a => a\.id !== id\);/g,
  `stagedAttachments = stagedAttachments.filter(a => a.id !== id);
  window.checkReceiptForReview('add', true);
  window.checkReceiptForReview('edit', true);`);

fs.writeFileSync('src/pages/expenses.js', code);
