const fs = require('fs');
let code = fs.readFileSync('src/pages/expenses.js', 'utf8');

const regex = /document\.getElementById\('editExpReceiptUrl'\)\.value = existing\.receipt_url \|\| '';[\s\S]*?renderReceiptPreviews\('editExpReceiptPreview', stagedEditAttachments\);/;

const replacement = `document.getElementById('editExpReceiptUrl').value = existing.receipt_url || '';
  
  const cbSubmit = document.getElementById('editExpSubmitReview');
  const alertBox = document.getElementById('editExpCorrectionAlert');
  const alertNotes = document.getElementById('editExpCorrectionNotes');
  
  if (cbSubmit) {
    cbSubmit.checked = existing.is_submitted !== false;
    window.checkReceiptForReview('edit');
    if (existing.is_submitted !== false) {
      // If it was true, we keep it true unless they change it. But checkReceiptForReview might override it to false if no receipt.
    } else {
      cbSubmit.checked = false; // explicitly false if it was draft
    }
  }

  if (alertBox && alertNotes) {
    if (existing.is_submitted === false && existing.review_notes) {
      alertBox.style.display = 'block';
      alertNotes.textContent = existing.review_notes;
    } else {
      alertBox.style.display = 'none';
      alertNotes.textContent = '';
    }
  }

  document.getElementById('editExpReceiptUrl').setAttribute('oninput', "window.checkReceiptForReview('edit')");

  renderReceiptPreviews('editExpReceiptPreview', stagedEditAttachments);`;

code = code.replace(regex, replacement);
fs.writeFileSync('src/pages/expenses.js', code);
