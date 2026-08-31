const fs = require('fs');
let code = fs.readFileSync('src/pages/expenses.js', 'utf8');

const regex = /document\.getElementById\('editExpReceiptUrl'\)\.value = exp\.receipt_url \|\| '';/;
const replacement = `document.getElementById('editExpReceiptUrl').value = exp.receipt_url || '';
  
  const cbSubmit = document.getElementById('editExpSubmitReview');
  const alertBox = document.getElementById('editExpCorrectionAlert');
  const alertNotes = document.getElementById('editExpCorrectionNotes');
  
  if (cbSubmit) {
    cbSubmit.checked = exp.is_submitted !== false;
    window.checkReceiptForReview('edit');
    if (exp.is_submitted === false) {
      cbSubmit.checked = false; 
    }
  }

  if (alertBox && alertNotes) {
    if (exp.is_submitted === false && exp.review_notes) {
      alertBox.style.display = 'block';
      alertNotes.textContent = exp.review_notes;
    } else {
      alertBox.style.display = 'none';
      alertNotes.textContent = '';
    }
  }

  document.getElementById('editExpReceiptUrl').setAttribute('oninput', "window.checkReceiptForReview('edit')");
`;

code = code.replace(regex, replacement);
fs.writeFileSync('src/pages/expenses.js', code);
