const fs = require('fs');
let code = fs.readFileSync('src/pages/income.js', 'utf8');

// 1. Fix the exchange rate bug
code = code.replace(
  /if \(rateInput && !rateInput\.value\) rateInput\.value = '1';/g,
  'if (rateInput) rateInput.value = \'1\';'
);
code = code.replace(
  /if \(rateInput && !rateInput\.value && rate !== null\) \{/g,
  'if (rateInput && rate !== null) {'
);

// 2. Remove budget allocations section from getRecordIncomePage
// We will just replace it with an empty string or comment it out by finding the index.
const marker1 = '<div class="alloc-section-card card">';
const endMarker1 = '</form>';

const formEndIdx = code.indexOf(endMarker1);
const allocStartIdx = code.indexOf(marker1);

if (allocStartIdx !== -1 && allocStartIdx < formEndIdx) {
    code = code.substring(0, allocStartIdx) + code.substring(formEndIdx);
}

const modalMarker = '<div id="allocationEntryModal" class="modal">';
const modalIdx = code.indexOf(modalMarker);
if (modalIdx !== -1) {
    // Find the end of the modal by looking for the end of the template literal
    const tplEnd = code.indexOf('`;', modalIdx);
    if (tplEnd !== -1) {
        code = code.substring(0, modalIdx) + code.substring(tplEnd);
    }
}

const editModalMarker = '<div class="alloc-section-card card" style="margin-top: 20px;">';
const editModalIdx = code.indexOf(editModalMarker);
if (editModalIdx !== -1) {
    const editBtnGroupIdx = code.indexOf('<div class="btn-group">', editModalIdx);
    if (editBtnGroupIdx !== -1) {
        code = code.substring(0, editModalIdx) + code.substring(editBtnGroupIdx);
    }
}

// Ensure rate auto-update triggers math update
code = code.replace(
  /rateInput\.value = rateForInput\(rate\);/g,
  'rateInput.value = rateForInput(rate);\n      window.onIncomeMathFieldsChange();'
);

fs.writeFileSync('src/pages/income.js', code, 'utf8');
console.log('Fixed income.js logic and removed allocations UI.');
