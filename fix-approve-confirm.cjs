const fs = require('fs');
let code = fs.readFileSync('src/pages/manager-expenses.js', 'utf8');

code = code.replace(
  "import { showToast } from '../components/toasts.js';",
  "import { showToast, showConfirm } from '../components/toasts.js';"
);

const oldApprove = `window.approveSingleExpense = async function(id) {
  if (!confirm('Approve this expense? It will be locked from further edits by the team.')) return;
  await processApproval([id]);
};

window.approveSelectedExpenses = async function() {
  const checked = Array.from(document.querySelectorAll('.mgr-exp-cb:checked')).map(b => b.value);
  if (checked.length === 0) {
    showToast('Select at least one expense to approve', 'error');
    return;
  }
  if (!confirm(\`Approve \${checked.length} expenses?\`)) return;
  await processApproval(checked);
};`;

const newApprove = `window.approveSingleExpense = async function(id) {
  showConfirm('Approve this expense? It will be locked from further edits by the team.', async () => {
    await processApproval([id]);
  });
};

window.approveSelectedExpenses = async function() {
  const checked = Array.from(document.querySelectorAll('.mgr-exp-cb:checked')).map(b => b.value);
  if (checked.length === 0) {
    showToast('Select at least one expense to approve', 'error');
    return;
  }
  showConfirm(\`Approve \${checked.length} expenses?\`, async () => {
    await processApproval(checked);
  });
};`;

code = code.replace(oldApprove, newApprove);
fs.writeFileSync('src/pages/manager-expenses.js', code);
