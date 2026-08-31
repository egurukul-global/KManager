const fs = require('fs');
let code = fs.readFileSync('src/pages/income.js', 'utf8');

// 1. Make editIncExchangeRate readonly
code = code.replace(
    'id="editIncExchangeRate" step="any" min="0.000001" required oninput="window.onEditIncomeMathChange()"></div>',
    'id="editIncExchangeRate" step="any" min="0.000001" required readonly oninput="window.onEditIncomeMathChange()"></div>'
);

// 2. Lock the editIncBucketId dropdown logic in openEditIncomeRecord
const target = `    const bucketSelect = document.getElementById('editIncBucketId');
    bucketSelect.innerHTML = '<option value="">Select Bucket</option>';
    teamBucketsCache.forEach(b => {
      bucketSelect.innerHTML += \`<option value="${b.id}" data-currency="${b.currency}">${b.name} (${b.currency})</option>\`;
    });
    bucketSelect.value = rec.bucket_id || '';`;

const replacement = `    const bucketSelect = document.getElementById('editIncBucketId');
    bucketSelect.innerHTML = '<option value="">Select Bucket</option>';
    const unallocated = teamBucketsCache.find(b => b.name === 'General Funds (Unallocated)' || b.is_system_bucket);
    if (unallocated) {
      bucketSelect.innerHTML += \`<option value="${unallocated.id}" data-currency="${unallocated.currency}">${unallocated.name} (${unallocated.currency})</option>\`;
      bucketSelect.value = unallocated.id;
    } else {
      teamBucketsCache.forEach(b => {
        bucketSelect.innerHTML += \`<option value="${b.id}" data-currency="${b.currency}">${b.name} (${b.currency})</option>\`;
      });
      bucketSelect.value = rec.bucket_id || '';
    }`;

if (code.includes(target)) {
    code = code.replace(target, replacement);
    console.log('Fixed edit bucket dropdown');
} else {
    // If exact target string doesn't match because of line endings, fallback to substring
    const idx1 = code.indexOf(`const bucketSelect = document.getElementById('editIncBucketId');`);
    const idx2 = code.indexOf(`bucketSelect.value = rec.bucket_id || '';`);
    if (idx1 !== -1 && idx2 !== -1) {
        code = code.substring(0, idx1) + replacement + code.substring(idx2 + `bucketSelect.value = rec.bucket_id || '';`.length);
        console.log('Fixed edit bucket dropdown (fallback)');
    } else {
        console.log('Could not find target block to replace for bucket dropdown');
    }
}

fs.writeFileSync('src/pages/income.js', code, 'utf8');
