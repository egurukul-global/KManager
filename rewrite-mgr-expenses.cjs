const fs = require('fs');
const code = `
import { supabaseClient } from '../supabaseClient.js';
import { state } from '../state.js';
import { showToast, escapeHtml, escapeHtmlAttr, formatUsdDisplay } from '../utils/uiHelpers.js';

let pendingReviewsCache = [];

export function getManagerExpensesPage() {
  return \`
    <h1 class="page-title">Global Expense Manager</h1>
    
    <div class="card">
      <div class="filter-section">
        <div class="form-stack">
          <div class="form-grid-row form-grid-row--filter-main">
            <div class="form-group">
              <label>Search</label>
              <input type="text" id="mgrExpSearch" placeholder="Search item..." oninput="window.refreshManagerExpenseList()">
            </div>
            <div class="form-group">
              <label>Team</label>
              <select id="mgrExpTeamFilter" onchange="window.refreshManagerExpenseList()"><option value="">All Teams</option></select>
            </div>
            <div class="form-group">
              <label>Budget</label>
              <select id="mgrExpBudgetFilter" onchange="window.refreshManagerExpenseList()"><option value="">All Budgets</option></select>
            </div>
          </div>
          <div class="form-grid-row form-grid-row--filter-dates">
            <div class="form-group"><label>From</label><input type="date" id="mgrExpDateFrom" onchange="window.refreshManagerExpenseList()"></div>
            <div class="form-group"><label>To</label><input type="date" id="mgrExpDateTo" onchange="window.refreshManagerExpenseList()"></div>
            <div class="form-group">
              <label>Receipt</label>
              <select id="mgrExpFilterReceipt" onchange="window.refreshManagerExpenseList()">
                <option value="">All</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
            <div class="form-group">
              <label>Status</label>
              <select id="mgrExpFilterStatus" onchange="window.refreshManagerExpenseList()">
                <option value="">All</option>
                <option value="reviewed">Reviewed</option>
                <option value="pending">Pending</option>
              </select>
            </div>
          </div>
        </div>
        <button type="button" class="secondary" style="margin-top:12px;" onclick="window.resetManagerExpenseFilters()">Reset filters</button>
      </div>

      <div class="bulk-actions show-desktop" style="display:flex; gap:8px; margin-bottom:12px;">
        <button type="button" class="primary" onclick="window.approveSelectedExpenses()">Approve Selected</button>
      </div>
      
      <h3>Expenses <span id="mgrExpenseCount" style="font-size:0.85em;color:#666;font-weight:normal;"></span></h3>
      
      <div class="table-container show-desktop">
        <table>
          <thead>
            <tr>
              <th class="checkbox-col" style="width:40px;"><input type="checkbox" onchange="window.toggleAllMgrExpenses(this)"></th>
              <th>Date</th>
              <th>Team</th>
              <th>Item</th>
              <th>Category</th>
              <th>Local</th>
              <th>USD</th>
              <th>Receipt</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="mgrExpensesTableBody">
            <tr><td colspan="10" style="text-align:center;">Loading...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
    
    <!-- Reject Modal -->
    <div id="rejectExpenseModal" class="modal">
      <div class="modal-content" style="max-width:500px;">
        <button type="button" class="close-modal" onclick="document.getElementById('rejectExpenseModal').style.display='none'">&times;</button>
        <h2>Send Back Expense</h2>
        <p>Please provide a reason for rejecting this expense. It will be sent back to the team as a Draft.</p>
        <form onsubmit="window.submitExpenseRejection(event)">
          <input type="hidden" id="rejectExpId">
          <div class="form-group">
            <label>Reason / Notes</label>
            <textarea id="rejectExpNotes" rows="3" required placeholder="e.g., Receipt is blurry, wrong category..."></textarea>
          </div>
          <button type="submit" class="danger" style="width:100%;">Reject & Send Back</button>
        </form>
      </div>
    </div>
  \`;
}

export async function initManagerExpensesPage() {
  await loadPendingExpenses();
}

window.resetManagerExpenseFilters = function() {
  document.getElementById('mgrExpSearch').value = '';
  document.getElementById('mgrExpTeamFilter').value = '';
  document.getElementById('mgrExpBudgetFilter').value = '';
  document.getElementById('mgrExpDateFrom').value = '';
  document.getElementById('mgrExpDateTo').value = '';
  document.getElementById('mgrExpFilterReceipt').value = '';
  document.getElementById('mgrExpFilterStatus').value = '';
  window.refreshManagerExpenseList();
};

window.refreshManagerExpenseList = function() {
  renderManagerExpenses();
};

async function loadPendingExpenses() {
  const tbody = document.getElementById('mgrExpensesTableBody');
  if (!tbody) return;
  
  // Note: fih, fin, fip, cao, caoh, ceo, admin, oh
  const globalRoles = ['admin', 'cao', 'caoh', 'ceo', 'oh', 'fih', 'fip', 'fin'];
  const isGlobal = globalRoles.includes(String(state.user?.role || '').toLowerCase());
  
  let query = supabaseClient
    .from('expenses')
    .select('id, date, item, usd_amount, local_amount, currency, receipt_url, budget_id, category_id, bucket_id, is_reviewed, is_submitted, team_id, teams(name), budget_plans(name), vendor_info')
    .eq('is_deleted', false)
    .eq('is_submitted', true)
    .order('date', { ascending: false });
    
  if (!isGlobal) {
    const userTeams = state.teams || [];
    const teamIds = userTeams.map(t => t.team_id);
    if (teamIds.length > 0) {
      query = query.in('team_id', teamIds);
    } else {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">No teams assigned to you.</td></tr>';
      return;
    }
  }

  const { data, error } = await query;
  if (error) {
    console.error(error);
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:red;">Error loading expenses.</td></tr>';
    return;
  }
  
  pendingReviewsCache = data || [];
  
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
      const name = pendingReviewsCache.find(e => e.budget_id === bid)?.budget_plans?.name || 'Unknown';
      budSel.innerHTML += \`<option value="\${bid}">\${escapeHtml(name)}</option>\`;
    });
  }
  
  renderManagerExpenses();
}

function renderManagerExpenses() {
  const tbody = document.getElementById('mgrExpensesTableBody');
  const countEl = document.getElementById('mgrExpenseCount');
  if (!tbody) return;
  
  if (pendingReviewsCache.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">No pending reviews.</td></tr>';
    if(countEl) countEl.textContent = '';
    return;
  }

  // Filter
  const q = (document.getElementById('mgrExpSearch')?.value || '').toLowerCase();
  const tId = document.getElementById('mgrExpTeamFilter')?.value || '';
  const bId = document.getElementById('mgrExpBudgetFilter')?.value || '';
  const dFrom = document.getElementById('mgrExpDateFrom')?.value || '';
  const dTo = document.getElementById('mgrExpDateTo')?.value || '';
  const receipt = document.getElementById('mgrExpFilterReceipt')?.value || '';
  const status = document.getElementById('mgrExpFilterStatus')?.value || '';
  
  let filtered = pendingReviewsCache;
  if (q) filtered = filtered.filter(e => (e.item||'').toLowerCase().includes(q) || (e.teams?.name||'').toLowerCase().includes(q));
  if (tId) filtered = filtered.filter(e => e.team_id === tId);
  if (bId) filtered = filtered.filter(e => e.budget_id === bId);
  if (dFrom) filtered = filtered.filter(e => e.date >= dFrom);
  if (dTo) filtered = filtered.filter(e => e.date <= dTo);
  
  if (receipt === 'yes') filtered = filtered.filter(e => e.receipt_url);
  if (receipt === 'no') filtered = filtered.filter(e => !e.receipt_url);
  if (status === 'reviewed') filtered = filtered.filter(e => e.is_reviewed);
  if (status === 'pending') filtered = filtered.filter(e => !e.is_reviewed);

  if(countEl) countEl.textContent = \`(\${filtered.length})\`;

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">No expenses match filters.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(exp => {
    let receiptLink = '<span style="color:#999;">-</span>';
    if (exp.receipt_url) {
      if (exp.receipt_url.startsWith('http')) {
        receiptLink = \`<a href="\${escapeHtmlAttr(exp.receipt_url)}" target="_blank" style="color:var(--primary);text-decoration:underline;">View</a>\`;
      } else {
        receiptLink = \`<span class="receipt-cell" data-receipt-stored="\${escapeHtmlAttr(exp.receipt_url)}">.</span>\`;
      }
    }
    
    const catLabel = exp.vendor_info ? exp.vendor_info.replace('budget_cat:', '') : (exp.category_id || '-');
    const statusPill = exp.is_reviewed 
      ? \`<span class="status-pill success" style="font-size:0.7em;">Reviewed</span>\` 
      : \`<span class="status-pill info" style="font-size:0.7em;">Pending Review</span>\`;
      
    return \`
      <tr>
        <td>\${exp.is_reviewed ? '-' : \`<input type="checkbox" class="mgr-exp-cb" value="\${exp.id}">\`}</td>
        <td>\${escapeHtml(exp.date)}</td>
        <td>\${escapeHtml(exp.teams?.name || 'Unknown')}</td>
        <td>\${escapeHtml(exp.item)}</td>
        <td>\${escapeHtml(catLabel)}</td>
        <td>\${(exp.local_amount || 0).toLocaleString()} \${exp.currency || ''}</td>
        <td style="font-weight:bold;">\${formatUsdDisplay(exp.usd_amount)}</td>
        <td>\${receiptLink}</td>
        <td>\${statusPill}</td>
        <td class="action-buttons" style="display:flex; gap:4px;">
          \${exp.is_reviewed ? '' : \`<button class="primary small" onclick="window.approveSingleExpense('\${exp.id}')">Approve</button>\`}
          <button class="danger small" onclick="window.promptRejectExpense('\${exp.id}')">Send Back</button>
        </td>
      </tr>
    \`;
  }).join('');
  
  if (window.hydrateReceiptCells) {
    window.hydrateReceiptCells();
  }
}

window.toggleAllMgrExpenses = function(cb) {
  const boxes = document.querySelectorAll('.mgr-exp-cb');
  boxes.forEach(b => b.checked = cb.checked);
};

window.approveSingleExpense = async function(id) {
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
};

async function processApproval(ids) {
  const payload = {
    is_reviewed: true,
    reviewed_by: state.user.id,
    reviewed_at: new Date().toISOString()
  };
  
  const { error } = await supabaseClient.from('expenses').update(payload).in('id', ids);
  if (error) {
    showToast('Failed to approve expenses', 'error');
    console.error(error);
  } else {
    showToast(\`Approved \${ids.length} expenses\`, 'success');
    await loadPendingExpenses();
  }
}

window.promptRejectExpense = function(id) {
  document.getElementById('rejectExpId').value = id;
  document.getElementById('rejectExpNotes').value = '';
  document.getElementById('rejectExpenseModal').style.display = 'block';
};

window.submitExpenseRejection = async function(e) {
  e.preventDefault();
  const id = document.getElementById('rejectExpId').value;
  const notes = document.getElementById('rejectExpNotes').value;
  
  const payload = {
    is_submitted: false,
    is_reviewed: false,
    review_notes: notes
  };
  
  const { error } = await supabaseClient.from('expenses').update(payload).eq('id', id);
  if (error) {
    showToast('Failed to reject expense', 'error');
  } else {
    showToast('Expense sent back to team', 'success');
    document.getElementById('rejectExpenseModal').style.display = 'none';
    await loadPendingExpenses();
  }
};
`;

fs.writeFileSync('src/pages/manager-expenses.js', code);
