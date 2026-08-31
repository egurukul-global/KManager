const fs = require('fs');
let code = fs.readFileSync('src/pages/expenses.js', 'utf8');

const oldLogic = `    let statusBadge = '<span class="status-pill warning" style="font-size:0.7em;">Draft</span>';
    if (exp.is_reviewed) {
      statusBadge = '<span class="status-pill success" style="font-size:0.7em;">Reviewed</span>';
    } else if (exp.is_submitted) {
      statusBadge = '<span class="status-pill info" style="font-size:0.7em;">Pending Review</span>';
    }`;

const newLogic = `    let statusBadge = '<span class="status-pill warning" style="font-size:0.7em;">Draft</span>';
    if (exp.is_reviewed) {
      statusBadge = '<span class="status-pill success" style="font-size:0.7em;">Reviewed</span>';
    } else if (exp.is_frozen) {
      statusBadge = '<span class="status-pill info" style="font-size:0.7em; background:#64748b; color:white;">Frozen (Budget Locked)</span>';
    } else if (exp.is_submitted) {
      statusBadge = '<span class="status-pill info" style="font-size:0.7em;">Pending Review</span>';
    }`;

code = code.replace(oldLogic, newLogic);
fs.writeFileSync('src/pages/expenses.js', code);
