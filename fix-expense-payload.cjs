const fs = require('fs');
let code = fs.readFileSync('src/utils/expenseHelpers.js', 'utf8');

const regex = /vendor_info,\s*status: 'recorded',\s*payment_status: 'paid',\s*created_by: userId,/;
const newLogic = `vendor_info,
    is_submitted: form.querySelector('#editExpSubmitReview')?.checked ?? form.querySelector('#expSubmitReview')?.checked ?? false,
    status: 'recorded',
    payment_status: 'paid',
    created_by: userId,`;

code = code.replace(regex, newLogic);
fs.writeFileSync('src/utils/expenseHelpers.js', code);
