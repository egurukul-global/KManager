const fs = require('fs');
let code = fs.readFileSync('src/pages/income.js', 'utf8');

// 1. Make editIncExchangeRate readonly
code = code.replace(
    'id="editIncExchangeRate" step="any" min="0.000001" required oninput="window.onEditIncomeMathChange()"></div>',
    'id="editIncExchangeRate" step="any" min="0.000001" required readonly oninput="window.onEditIncomeMathChange()"></div>'
);

// 2. Lock the editIncBucketId dropdown logic in openEditIncomeRecord
const replacement = "    const bucketSelect = document.getElementById('editIncBucketId');\n" +
    "    bucketSelect.innerHTML = '<option value=\"\">Select Bucket</option>';\n" +
    "    const unallocated = teamBucketsCache.find(b => b.name === 'General Funds (Unallocated)' || b.is_system_bucket);\n" +
    "    if (unallocated) {\n" +
    "      bucketSelect.innerHTML += '<option value=\"' + unallocated.id + '\" data-currency=\"' + unallocated.currency + '\">' + unallocated.name + ' (' + unallocated.currency + ')</option>';\n" +
    "      bucketSelect.value = unallocated.id;\n" +
    "    } else {\n" +
    "      teamBucketsCache.forEach(b => {\n" +
    "        bucketSelect.innerHTML += '<option value=\"' + b.id + '\" data-currency=\"' + b.currency + '\">' + b.name + ' (' + b.currency + ')</option>';\n" +
    "      });\n" +
    "      bucketSelect.value = rec.bucket_id || '';\n" +
    "    }";

const idx1 = code.indexOf(`const bucketSelect = document.getElementById('editIncBucketId');`);
const idx2 = code.indexOf(`bucketSelect.value = rec.bucket_id || '';`);
if (idx1 !== -1 && idx2 !== -1) {
    code = code.substring(0, idx1) + replacement + code.substring(idx2 + `bucketSelect.value = rec.bucket_id || '';`.length);
    console.log('Fixed edit bucket dropdown');
}

fs.writeFileSync('src/pages/income.js', code, 'utf8');
