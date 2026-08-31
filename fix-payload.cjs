const fs = require('fs');
let code = fs.readFileSync('src/utils/expenseHelpers.js', 'utf8');

const target = /return payload;/;
const replacement = `  // Add the submission fields
  const cbSubmit = form.querySelector('input[name="is_submitted"]');
  if (cbSubmit) payload.is_submitted = cbSubmit.checked;
  return payload;`;

code = code.replace(target, replacement);
fs.writeFileSync('src/utils/expenseHelpers.js', code);
