const fs = require('fs');
let code = fs.readFileSync('src/pages/expenses.js', 'utf8');

const thRegex = /<th>Local<\/th><th>USD<\/th><th>Receipt<\/th><th>Actions<\/th>/;
const thReplacement = `<th>Local</th><th>USD</th><th>Receipt</th><th>Status</th><th>Actions</th>`;
code = code.replace(thRegex, thReplacement);

const htmlRegex = /<td>\$\{receipt\}<\/td>\s*<td class="action-buttons">/g;
const htmlReplacement = `<td>\${receipt}</td>
        <td>\${statusBadge}</td>
        <td class="action-buttons">`;
code = code.replace(htmlRegex, htmlReplacement);

const cardRegex = /\$\{cardRow\('Receipt', receipt\)\}/g;
const cardReplacement = `\${cardRow('Receipt', receipt)}
        \${cardRow('Status', statusBadge)}`;
code = code.replace(cardRegex, cardReplacement);

const jsRegex = /const receipt = receiptCellHtml\(exp\);/g;
const jsReplacement = `const receipt = receiptCellHtml(exp);
    let statusBadge = '<span class="status-pill warning" style="font-size:0.7em;">Draft</span>';
    if (exp.is_reviewed) {
      statusBadge = '<span class="status-pill success" style="font-size:0.7em;">Reviewed</span>';
    } else if (exp.is_submitted) {
      statusBadge = '<span class="status-pill info" style="font-size:0.7em;">Pending Review</span>';
    }`;
code = code.replace(jsRegex, jsReplacement);

// Also need to update canEditExpense to check is_reviewed
const canEditRegex = /function canEditExpense\(exp\) \{/g;
const canEditReplacement = `function canEditExpense(exp) {
  if (exp && exp.is_reviewed) return false;`;
code = code.replace(canEditRegex, canEditReplacement);

fs.writeFileSync('src/pages/expenses.js', code);
