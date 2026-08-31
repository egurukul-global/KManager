const fs = require('fs');
let code = fs.readFileSync('src/pages/income.js', 'utf8');

const targetIdx = code.indexOf('if (bucketSelect) {');
const targetEndIdx = code.indexOf('}', code.indexOf('});', targetIdx)) + 1;

if (targetIdx !== -1 && targetEndIdx !== -1 && targetEndIdx > targetIdx) {
    const replacement = `    if (bucketSelect) {
      bucketSelect.innerHTML = '<option value="">Select Bucket</option>';
      const unallocated = teamBucketsCache.find(b => b.name === 'General Funds (Unallocated)' || b.is_system_bucket);
      if (unallocated) {
        bucketSelect.innerHTML += '<option value="' + unallocated.id + '" data-currency="' + unallocated.currency + '">' + unallocated.name + ' (' + unallocated.currency + ')</option>';
        bucketSelect.value = unallocated.id;
        setTimeout(() => window.onIncomeBucketChange(bucketSelect), 50);
      } else {
        teamBucketsCache.forEach(b => {
          bucketSelect.innerHTML += '<option value="' + b.id + '" data-currency="' + b.currency + '">' + b.name + ' (' + b.currency + ')</option>';
        });
      }
    }`;
    code = code.substring(0, targetIdx) + replacement + code.substring(targetEndIdx);
    fs.writeFileSync('src/pages/income.js', code, 'utf8');
    console.log('Fixed income.js bucket selection');
} else {
    console.log('Target not found');
}
