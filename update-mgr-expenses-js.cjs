const fs = require('fs');
let code = fs.readFileSync('src/pages/manager-expenses.js', 'utf8');

const queryRegex = /\.select\('id, date, item, usd_amount, receipt_url, team_id, teams\(name\)'\)/g;
const newQuery = `.select('id, date, item, usd_amount, local_amount, currency, receipt_url, budget_id, category_id, bucket_id, is_reviewed, is_submitted, team_id, teams(name), budgets(name), categories(name)')`;
code = code.replace(queryRegex, newQuery);

const initRegex = /export async function initManagerExpensesPage\(\) \{[\s\S]*?\}\n/g;
const newInit = `export async function initManagerExpensesPage() {
  await loadPendingExpenses();
}

window.resetManagerExpenseFilters = function() {
  document.getElementById('mgrExpSearch').value = '';
  document.getElementById('mgrExpTeamFilter').value = '';
  document.getElementById('mgrExpBudgetFilter').value = '';
  document.getElementById('mgrExpDateFrom').value = '';
  document.getElementById('mgrExpDateTo').value = '';
  window.refreshManagerExpenseList();
};

window.refreshManagerExpenseList = function() {
  renderManagerExpenses();
};
`;
code = code.replace(initRegex, newInit);

const renderRegex = /function renderManagerExpenses\(\) \{[\s\S]*?\}\n/g;
const newRender = `function renderManagerExpenses() {
  const tbody = document.getElementById('mgrExpensesTableBody');
  if (!tbody) return;
  
  if (pendingReviewsCache.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">No pending reviews.</td></tr>';
    return;
  }
  
  // Populate dropdowns once
  const teamSel = document.getElementById('mgrExpTeamFilter');
  const budSel = document.getElementById('mgrExpBudgetFilter');
  if (teamSel && teamSel.options.length <= 1) {
    const teams = [...new Set(pendingReviewsCache.map(e => e.team_id))];
    teams.forEach(tid => {
      const name = pendingReviewsCache.find(e => e.team_id === tid)?.teams?.name || 'Unknown';
      teamSel.innerHTML += \`<option value="\${tid}">\${escapeHtml(name)}</option>\`;
    });
  }
  if (budSel && budSel.options.length <= 1) {
    const buds = [...new Set(pendingReviewsCache.map(e => e.budget_id))];
    buds.forEach(bid => {
      const name = pendingReviewsCache.find(e => e.budget_id === bid)?.budgets?.name || 'Unknown';
      budSel.innerHTML += \`<option value="\${bid}">\${escapeHtml(name)}</option>\`;
    });
  }

  // Filter
  const q = (document.getElementById('mgrExpSearch')?.value || '').toLowerCase();
  const tId = document.getElementById('mgrExpTeamFilter')?.value || '';
  const bId = document.getElementById('mgrExpBudgetFilter')?.value || '';
  const dFrom = document.getElementById('mgrExpDateFrom')?.value || '';
  const dTo = document.getElementById('mgrExpDateTo')?.value || '';
  
  let filtered = pendingReviewsCache;
  if (q) filtered = filtered.filter(e => (e.item||'').toLowerCase().includes(q) || (e.teams?.name||'').toLowerCase().includes(q));
  if (tId) filtered = filtered.filter(e => e.team_id === tId);
  if (bId) filtered = filtered.filter(e => e.budget_id === bId);
  if (dFrom) filtered = filtered.filter(e => e.date >= dFrom);
  if (dTo) filtered = filtered.filter(e => e.date <= dTo);

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">No expenses match filters.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(exp => {
    let receiptLink = '<span style="color:#999;">—</span>';
    if (exp.receipt_url) {
      if (exp.receipt_url.startsWith('http')) {
        receiptLink = \`<a href="\${escapeHtmlAttr(exp.receipt_url)}" target="_blank" style="color:var(--primary);text-decoration:underline;">📎</a>\`;
      } else {
        receiptLink = \`<span class="receipt-cell" data-receipt-stored="\${escapeHtmlAttr(exp.receipt_url)}">…</span>\`;
      }
    }
      
    return \`
      <tr>
        <td><input type="checkbox" class="mgr-exp-cb" value="\${exp.id}"></td>
        <td>\${escapeHtml(exp.date)}</td>
        <td>\${escapeHtml(exp.teams?.name || 'Unknown')}</td>
        <td>\${escapeHtml(exp.item)}</td>
        <td>\${escapeHtml(exp.categories?.name || '—')}</td>
        <td>\${(exp.local_amount || 0).toLocaleString()} \${exp.currency || ''}</td>
        <td style="font-weight:bold;">\${formatUsdDisplay(exp.usd_amount)}</td>
        <td>\${receiptLink}</td>
        <td><span class="status-pill info" style="font-size:0.7em;">Pending Review</span></td>
        <td class="action-buttons" style="display:flex; gap:4px;">
          <button class="primary small" onclick="window.approveSingleExpense('\${exp.id}')">Approve</button>
          <button class="danger small" onclick="window.promptRejectExpense('\${exp.id}')">Send Back</button>
        </td>
      </tr>
    \`;
  }).join('');
  
  if (window.hydrateReceiptCells) {
    window.hydrateReceiptCells();
  }
}
`;
code = code.replace(renderRegex, newRender);

fs.writeFileSync('src/pages/manager-expenses.js', code);
