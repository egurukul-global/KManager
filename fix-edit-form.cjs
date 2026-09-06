const fs = require('fs');
let c = fs.readFileSync('src/pages/expenses.js', 'utf8');

// Fix 3: Remove duplicate populateBucketSelect
const oldDups = `  populateBucketSelect(document.getElementById('editExpBucket'));

  populateBucketSelect(document.getElementById('editExpBucket'));`;
if (c.includes(oldDups)) {
  c = c.replace(oldDups, `  populateBucketSelect(document.getElementById('editExpBucket'));`);
  console.log('Fix 3: remove duplicate - applied');
} else {
  console.log('Fix 3: NOT FOUND - trying with \\r\\n');
}

// Fix 4: Restore submit checkbox after receipt setup
const oldModalEnd = `  document.getElementById('editExpenseModal').classList.add('active');\n}`;
const newModalEnd = `  // Restore submit checkbox - only if receipts exist
  const hadReceipts = allKeys.length > 0;
  if (cbSubmit && hadReceipts) {
    cbSubmit.disabled = false;
    cbSubmit.checked = exp.is_submitted !== false;
  }
  window.checkReceiptForReview('edit', false);

  document.getElementById('editExpenseModal').classList.add('active');
}`;

if (c.includes(oldModalEnd)) {
  c = c.replace(oldModalEnd, newModalEnd);
  console.log('Fix 4: restore submit checkbox - applied');
} else {
  console.log('Fix 4: NOT FOUND');
  // Search for the exact string
  const idx = c.indexOf("document.getElementById('editExpenseModal').classList.add('active');");
  if (idx >= 0) {
    console.log('Found modal active at index:', idx);
    console.log('Context:', JSON.stringify(c.slice(idx-10, idx+50)));
  }
}

fs.writeFileSync('src/pages/expenses.js', c);
console.log('Done');



