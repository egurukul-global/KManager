import { isFinanceGlobalAdmin } from '../utils/appRoles.js';
// ==================== MANAGER - FINANCE ====================
import { state } from '../state.js';
import { sbSelect, supabaseClient } from '../db.js';
window.supabaseClient = supabaseClient;
import { showToast } from '../components/toasts.js';
import { downloadCSV, convertArrayOfObjectsToCSV } from '../utils/exportCsv.js';
import { formatUsdDisplay } from '../utils/currency.js';

let cachedReconciliationData = [];

export function getManagerFinancePage() {
  const allowedRoles = ['admin', 'cao', 'caoh', 'ceo', 'oh', 'fin', 'fip'];
  const userRole = String(state.user?.role || '').toLowerCase();
  if (!allowedRoles.includes(userRole)) {
    return `
      <h1 class="page-title">Receivables</h1>
      <div class="card">
        <h2>🔒 Access Denied</h2>
        <p>You do not have the required executive or finance permissions to view this dashboard.</p>
      </div>
    `;
  }

  // Trigger data load in background
  setTimeout(loadFinanceDashboardData, 100);

  return `
    <h1 class="page-title">Receivables</h1>
    
    <div class="stats-grid dash-stats" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; margin-bottom: 25px;">
      <div class="card card-hover glass" style="padding: 20px; border-radius: var(--radius); border: 1px solid var(--border); box-shadow: var(--shadow);">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary);">Total Allocated</span>
          <div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(59, 130, 246, 0.1); color: var(--primary); display: flex; align-items: center; justify-content: center;"><i class="fa-solid fa-coins"></i></div>
        </div>
        <div>
          <h3 id="mgrBlobAllocated" style="font-size: 1.8rem; font-weight: 700; margin: 0; color: var(--text);">...</h3>
          <p style="font-size: 0.75rem; color: var(--text-muted); margin: 4px 0 0 0;">Income assigned to budgets</p>
        </div>
      </div>
      <div class="card card-hover glass" style="padding: 20px; border-radius: var(--radius); border: 1px solid var(--border); box-shadow: var(--shadow);">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary);">Booked Expenses</span>
          <div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(239, 68, 68, 0.1); color: var(--error); display: flex; align-items: center; justify-content: center;"><i class="fa-solid fa-receipt"></i></div>
        </div>
        <div>
          <h3 id="mgrBlobExpenses" style="font-size: 1.8rem; font-weight: 700; margin: 0; color: var(--text);">...</h3>
          <p style="font-size: 0.75rem; color: var(--text-muted); margin: 4px 0 0 0;">Expenses attached to budgets</p>
        </div>
      </div>
      <div class="card card-hover glass" style="padding: 20px; border-radius: var(--radius); border: 1px solid var(--border); box-shadow: var(--shadow);">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary);">Outstanding</span>
          <div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(245, 158, 11, 0.1); color: var(--warning); display: flex; align-items: center; justify-content: center;"><i class="fa-solid fa-scale-unbalanced"></i></div>
        </div>
        <div>
          <h3 id="mgrBlobOutstanding" style="font-size: 1.8rem; font-weight: 700; margin: 0; color: var(--text);">...</h3>
          <p style="font-size: 0.75rem; color: var(--text-muted); margin: 4px 0 0 0;">Allocated minus Booked</p>
        </div>
      </div>
    </div>
    
    <div class="card">
      <h2>Actionable Queues</h2>
      <div style="display: flex; gap: 15px; margin-bottom: 20px;">
        <button class="btn" style="flex:1; padding:20px; background-color:var(--error); color:white; cursor:pointer;" onclick="window._finFilterError = true; window.renderFinanceTable();" title="Click to view budgets with negative balances">
          <h3 id="qReconError">...</h3>
          <p>Reconciliation Errors</p>
        </button>
        <button class="btn" style="flex:1; padding:20px; background-color:var(--primary); color:white; cursor:pointer;" onclick="window.showPage('reconciliation-approval')" title="Click to review pending team transfers">
          <h3 id="qPendingTransfers">...</h3>
          <p>Pending Transfers</p>
        </button>
      </div>
    </div>

    <div class="card">
      <h2>Global Budget Reconciliation</h2>
      <div class="filter-section" style="margin-bottom: 20px; display: flex; flex-direction: column; gap:15px; background: rgba(255,255,255,0.02); padding: 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
        
        <div style="display: flex; gap: 15px; flex-wrap: wrap;">
          <div class="toggle-group" style="display:flex; gap: 4px; background: rgba(0,0,0,0.2); padding: 4px; border-radius: 6px; flex: 0 0 auto;">
            <button id="finViewDetailedBtn" class="sq-btn primary" onclick="window.setFinView('detailed')" style="padding: 6px 12px; font-size: 0.85em; height: auto;">Detailed</button>
            <button id="finViewSummaryBtn" class="sq-btn secondary" onclick="window.setFinView('summary')" style="padding: 6px 12px; font-size: 0.85em; height: auto;">Summary</button>
          </div>

          <div class="form-group" style="flex: 2; min-width:200px; margin: 0;">
            <input type="text" id="finSearchInput" placeholder="Search by Team, Budget, Owner..." onkeyup="window.renderFinanceTable()" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text);">
          </div>

          <div class="form-group" id="finGroupByContainer" style="display:none; flex: 1; min-width: 140px; margin: 0;">
            <select id="finGroupBy" onchange="window.renderFinanceTable()" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text);">
              <option value="team">Group by: Team</option>
              <option value="person">Group by: Requester</option>
              <option value="oph">Group by: OPH</option>
            </select>
          </div>
        </div>

        <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
          <div class="form-group" style="flex: 0 0 140px; margin: 0;">
            <input type="date" id="finDateFrom" onchange="window.renderFinanceTable()" title="From Date" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text);">
          </div>
          <div class="form-group" style="flex: 0 0 140px; margin: 0;">
            <input type="date" id="finDateTo" onchange="window.renderFinanceTable()" title="To Date" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text);">
          </div>

          <div class="form-group" style="flex:1; min-width:180px; position:relative; margin: 0;">
            <div onclick="const d = document.getElementById('finTeamDropdown'); d.style.display = d.style.display === 'none' ? 'block' : 'none';" style="border:1px solid var(--border); padding:8px 12px; cursor:pointer; border-radius:4px; background:var(--bg-secondary); color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" id="finTeamLabel">All Teams</div>
            <div id="finTeamDropdown" onmouseleave="this.style.display='none'" style="display:none; position:absolute; top:100%; left:0; right:0; background:var(--bg, #fff); border:1px solid var(--border); z-index:10; max-height:250px; overflow-y:auto; padding:8px; box-shadow:0 8px 16px rgba(0,0,0,0.5);"></div>
          </div>

          <div class="form-group" style="flex:1; min-width:180px; position:relative; margin: 0;">
            <div onclick="const d = document.getElementById('finBudgetDropdown'); d.style.display = d.style.display === 'none' ? 'block' : 'none';" style="border:1px solid var(--border); padding:8px 12px; cursor:pointer; border-radius:4px; background:var(--bg-secondary); color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" id="finBudgetLabel">All Budgets</div>
            <div id="finBudgetDropdown" onmouseleave="this.style.display='none'" style="display:none; position:absolute; top:100%; left:0; right:0; background:var(--bg, #fff); border:1px solid var(--border); z-index:10; max-height:250px; overflow-y:auto; padding:8px; box-shadow:0 8px 16px rgba(0,0,0,0.5);"></div>
          </div>

          <div class="form-group" style="flex: 0 0 120px; margin: 0;">
            <select id="finStatusFilter" onchange="window._finFilterError = false; window.renderFinanceTable()" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text);">
              <option value="ALL">All Statuses</option>
              <option value="OPEN">Open</option>
              <option value="CLOSED">Reconciled</option>
            </select>
          </div>

          <div class="form-group" style="flex: 0 0 auto; margin: 0; display:flex; gap: 4px;">
            <button type="button" class="secondary small" onclick="window.exportFinanceReportToCSV()" style="padding:8px 12px; font-size:0.85em;">CSV</button>
            <button type="button" class="secondary small" onclick="window.exportFinanceReportToPDF()" style="padding:8px 12px; font-size:0.85em;">PDF</button>
          </div>
        </div>
      </div>
      
      <div class="table-responsive" id="finTableContainer">
        <table class="data-table">
          <thead id="finTableHead">
            <tr>
              <th>Team</th>
              <th>Budget Plan</th>
              <th>Allocated</th>
              <th>Expenses Logged</th>
              <th>Funds Returned</th>
              <th>Remaining Held</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody id="financeDashboardTableBody">
            <tr><td colspan="7" style="text-align:center;">Loading database view...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function loadFinanceDashboardData() {
  try {
    // 1. Determine Scope based on RBAC
    const isGlobal = isFinanceGlobalAdmin();
    
    let query = window.supabaseClient.from('budget_reconciliation_view').select('*');
    
    if (!isGlobal) {
      const userTeams = state.teams || [];
      const teamIds = userTeams.map(t => t.team_id);
      if (teamIds.length > 0) {
        query = query.in('team_id', teamIds);
      } else {
        renderFinanceTable();
        return;
      }
    }

    const { data, error } = await query;
    if (error) throw error;
    
    cachedReconciliationData = data || [];
    
    // Populate Team & Budget Filters dynamically
    const finTeamDropdown = document.getElementById('finTeamDropdown');
    const finBudgetDropdown = document.getElementById('finBudgetDropdown');
    
    if (finTeamDropdown && finBudgetDropdown) {
      const uniqueTeams = Array.from(new Set(cachedReconciliationData.map(b => b.team_id))).filter(id => id);
      const uniqueBudgets = Array.from(new Set(cachedReconciliationData.map(b => b.budget_id))).filter(id => id);
      
      finTeamDropdown.innerHTML = '<label style="display:block; padding:4px; cursor:pointer;"><input type="checkbox" value="ALL" checked onchange="window.toggleAllFinFilters(this, \'team\')"> All Teams</label>' + 
        uniqueTeams.map(id => {
          const teamName = cachedReconciliationData.find(b => b.team_id === id)?.team_name || 'Unknown Team';
          return `<label style="display:block; padding:4px; cursor:pointer;"><input type="checkbox" class="fin-team-cb" value="${id}" onchange="window.updateFinFilterLabels()"> ${teamName}</label>`;
        }).join('');
        
      finBudgetDropdown.innerHTML = '<label style="display:block; padding:4px; cursor:pointer;"><input type="checkbox" value="ALL" checked onchange="window.toggleAllFinFilters(this, \'budget\')"> All Budgets</label>' + 
        uniqueBudgets.map(id => {
          const bName = cachedReconciliationData.find(b => b.budget_id === id)?.budget_name || (id.substring(0,8) + '...');
          return `<label style="display:block; padding:4px; cursor:pointer;"><input type="checkbox" class="fin-budget-cb" value="${id}" onchange="window.updateFinFilterLabels()"> ${bName}</label>`;
        }).join('');
    }
    
    // Calculate Queues
    document.getElementById('qReconError').textContent = cachedReconciliationData.filter(b => b.remaining_held_balance < 0).length;
    
    const pendingTransfers = await window.supabaseClient.from('transfers').select('id').eq('status', 'PENDING').eq('is_deleted', false);
    document.getElementById('qPendingTransfers').textContent = (pendingTransfers.data || []).length;
    
    renderFinanceTable();
  } catch (err) {
    console.error(err);
    const tbody = document.getElementById('financeDashboardTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="color:var(--error);">Failed to load reconciliation data.</td></tr>';
}
  }
window.toggleAllFinFilters = function(cb, type) {
  const cbs = document.querySelectorAll(`.fin-${type}-cb`);
  cbs.forEach(c => c.checked = false);
  window.updateFinFilterLabels();
};

window.updateFinFilterLabels = function() {
  window._finFilterError = false;
  const teamCbs = Array.from(document.querySelectorAll('.fin-team-cb:checked'));
  const teamAll = document.querySelector('#finTeamDropdown input[value="ALL"]');
  if (teamCbs.length > 0 && teamAll) teamAll.checked = false;
  if (teamCbs.length === 0 && teamAll) teamAll.checked = true;
  document.getElementById('finTeamLabel').textContent = teamCbs.length === 0 ? 'All Teams' : `${teamCbs.length} selected`;

  const budgetCbs = Array.from(document.querySelectorAll('.fin-budget-cb:checked'));
  const budgetAll = document.querySelector('#finBudgetDropdown input[value="ALL"]');
  if (budgetCbs.length > 0 && budgetAll) budgetAll.checked = false;
  if (budgetCbs.length === 0 && budgetAll) budgetAll.checked = true;
  document.getElementById('finBudgetLabel').textContent = budgetCbs.length === 0 ? 'All Budgets' : `${budgetCbs.length} selected`;

  window.renderFinanceTable();
};

let currentFinView = 'detailed';

window.setFinView = function(mode) {
  currentFinView = mode;
  const detailedBtn = document.getElementById('finViewDetailedBtn');
  const summaryBtn = document.getElementById('finViewSummaryBtn');
  const groupBy = document.getElementById('finGroupByContainer');
  
  if (mode === 'detailed') {
    detailedBtn.className = 'sq-btn primary';
    summaryBtn.className = 'sq-btn secondary';
    groupBy.style.display = 'none';
  } else {
    detailedBtn.className = 'sq-btn secondary';
    summaryBtn.className = 'sq-btn primary';
    groupBy.style.display = 'block';
  }
  
  window.renderFinanceTable();
};

window.renderFinanceTable = function() {
  const tbody = document.getElementById('financeDashboardTableBody');
  const thead = document.getElementById('finTableHead');
  if (!tbody || !thead) return;

  const statusFilter = document.getElementById('finStatusFilter')?.value || 'ALL';
  const teamAll = document.querySelector('#finTeamDropdown input[value="ALL"]')?.checked !== false;
  const teamChecked = Array.from(document.querySelectorAll('.fin-team-cb:checked')).map(c => c.value);
  
  const budgetAll = document.querySelector('#finBudgetDropdown input[value="ALL"]')?.checked !== false;
  const budgetChecked = Array.from(document.querySelectorAll('.fin-budget-cb:checked')).map(c => c.value);
  
  const searchQ = (document.getElementById('finSearchInput')?.value || '').toLowerCase();
  const dateFrom = document.getElementById('finDateFrom')?.value;
  const dateTo = document.getElementById('finDateTo')?.value;
  const groupBy = document.getElementById('finGroupBy')?.value || 'team';
  
  let filtered = cachedReconciliationData;

  // Search Filter
  if (searchQ) {
    filtered = filtered.filter(b => {
      const bName = (b.budget_name || '').toLowerCase();
      const tName = (b.team_name || '').toLowerCase();
      const oName = (b.owner_name || '').toLowerCase();
      return bName.includes(searchQ) || tName.includes(searchQ) || oName.includes(searchQ);
    });
  }

  // Date Filter
  if (dateFrom) {
    filtered = filtered.filter(b => b.budget_period_date && b.budget_period_date >= dateFrom);
  }
  if (dateTo) {
    filtered = filtered.filter(b => b.budget_period_date && b.budget_period_date <= dateTo);
  }

  // Team & Budget Filters
  if (!teamAll && teamChecked.length > 0) {
    filtered = filtered.filter(b => teamChecked.includes(b.team_id));
  }
  if (!budgetAll && budgetChecked.length > 0) {
    filtered = filtered.filter(b => budgetChecked.includes(b.budget_id));
  }

  // Status Filter
  if (window._finFilterError) {
    filtered = filtered.filter(b => b.remaining_held_balance < 0);
  } else {
    if (statusFilter === 'OPEN') filtered = filtered.filter(b => b.remaining_held_balance !== 0);
    if (statusFilter === 'CLOSED') filtered = filtered.filter(b => b.remaining_held_balance === 0);
  }


  const sumAllocated = filtered.reduce((s, b) => s + (parseFloat(b.allocated_amount) || 0), 0);
  const sumExpenses = filtered.reduce((s, b) => s + (parseFloat(b.expenses_amount) || 0), 0);
  const sumOutstanding = filtered.reduce((s, b) => s + (parseFloat(b.remaining_held_balance) || 0), 0);
  
  const elAlloc = document.getElementById('mgrBlobAllocated');
  if (elAlloc) elAlloc.textContent = '$' + formatUsdDisplay(sumAllocated);
  const elExp = document.getElementById('mgrBlobExpenses');
  if (elExp) elExp.textContent = '$' + formatUsdDisplay(sumExpenses);
  const elOut = document.getElementById('mgrBlobOutstanding');
  if (elOut) elOut.textContent = '$' + formatUsdDisplay(sumOutstanding);

  if (currentFinView === 'summary') {
    // Group the data
    const summaryMap = {};
    filtered.forEach(b => {
      let key = 'Unknown';
      let label = 'Unknown';
      
      if (groupBy === 'team') {
        key = b.team_id || 'no-team';
        label = b.team_name || 'Unassigned Team';
      } else if (groupBy === 'person') {
        key = b.owner_user_id || 'no-owner';
        label = b.owner_name || 'Unassigned Person';
      } else if (groupBy === 'oph') {
        key = b.oph_id || 'no-oph';
        label = b.oph_name || 'No OPH Associated';
      }
      
      if (!summaryMap[key]) {
        summaryMap[key] = { label, allocated: 0, expenses: 0, returned: 0, count: 0 };
      }
      summaryMap[key].allocated += (b.allocated_amount || 0);
      summaryMap[key].expenses += (b.expenses_amount || 0);
      summaryMap[key].returned += (b.unused_funds_returned || 0);
      summaryMap[key].count += 1;
    });

    const summaryGroups = Object.values(summaryMap).sort((a, b) => a.label.localeCompare(b.label));
    
    let thLabel = 'Team';
    if (groupBy === 'person') thLabel = 'Requester';
    if (groupBy === 'oph') thLabel = 'OPH';
    
    thead.innerHTML = "<tr><th>" + thLabel + "</th><th>Budget Count</th><th>Total Allocated</th><th>Total Expenses</th><th>Total Returned</th><th>Net Remaining Held</th></tr>";

    if (summaryGroups.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No records match criteria.</td></tr>';
      return;
    }

    tbody.innerHTML = summaryGroups.map(g => {
      const net = g.allocated - g.expenses - g.returned;
      const statusClass = net === 0 ? 'success' : (net < 0 ? 'error' : 'warning');
      const safeLabel = (g.label || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return "<tr><td style=\"font-weight: bold;\">" + safeLabel + "</td><td>" + g.count + "</td><td>" + (g.allocated).toFixed(2) + "</td><td>" + (g.expenses).toFixed(2) + "</td><td>" + (g.returned).toFixed(2) + "</td><td><span class=\"status-pill " + statusClass + "\">" + (net).toFixed(2) + "</span></td></tr>";
    }).join('');
    
    return;
  }

  // Detailed View HTML Setup
  thead.innerHTML = "<tr><th>Team</th><th>Budget Plan</th><th>Allocated</th><th>Expenses Logged</th><th>Funds Returned</th><th>Remaining Held</th><th>Status</th></tr>";

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No budget records match criteria.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(b => {
    const isReconciled = b.remaining_held_balance === 0;
    const isError = b.remaining_held_balance < 0;
    let statusBadge = '<span class="badge badge-warning">Open</span>';
    if (isReconciled) statusBadge = '<span class="badge badge-success">Reconciled</span>';
    if (isError) statusBadge = '<span class="badge badge-error" style="background:var(--error);color:white;">Error</span>';
    
    return `
      <tr>
        <td>${b.team_name || 'Global'}</td>
        <td>${b.budget_name || (b.budget_id ? b.budget_id.substring(0,8) + '...' : 'Unknown')}</td>
        <td>${(b.allocated_amount || 0).toFixed(2)}</td>
        <td>${(b.expenses_amount || 0).toFixed(2)}</td>
        <td>${(b.unused_funds_returned || 0).toFixed(2)}</td>
        <td style="font-weight:bold; color: ${isError ? 'var(--error)' : 'var(--text)'};">${(b.remaining_held_balance || 0).toFixed(2)}</td>
        <td>${statusBadge}</td>
      </tr>
    `;
  }).join('');
}


window.exportFinanceReportToPDF = function() {
  if (!cachedReconciliationData.length) {
    alert('No data to export.');
    return;
  }
  try {
    const rows = cachedReconciliationData.map(b => [
      b.team_name || 'Global',
      b.budget_name || (b.budget_id ? b.budget_id.substring(0,8) : ''),
      '$' + (b.allocated_amount || 0).toFixed(2),
      '$' + (b.expenses_amount || 0).toFixed(2),
      '$' + (b.unused_funds_returned || 0).toFixed(2),
      '$' + (b.remaining_held_balance || 0).toFixed(2)
    ]);
    const docDefinition = {
      content: [
        { text: 'Global Budget Reconciliation Report', style: 'header' },
        { text: 'Generated on: ' + new Date().toLocaleDateString(), margin: [0,0,0,10] },
        {
          table: {
            headerRows: 1,
            widths: ['auto', '*', 'auto', 'auto', 'auto', 'auto'],
            body: [
              ['Team', 'Budget Plan', 'Allocated', 'Expenses', 'Returned', 'Remaining'],
              ...rows
            ]
          }
        }
      ],
      styles: {
        header: { fontSize: 18, bold: true, margin: [0, 0, 0, 10] }
      }
    };
    pdfMake.createPdf(docDefinition).download('finance_report.pdf');
  } catch(e) {
    console.error(e);
    alert('Failed to generate PDF. Make sure pdfmake is loaded.');
  }
};

window.exportFinanceReportToCSV = function() {
  if (!cachedReconciliationData.length) {
    alert('No data to export.');
    return;
  }
  let csv = 'Team Name,Budget Name,Allocated Amount,Expenses Amount,Funds Returned,Remaining Balance\n';
  cachedReconciliationData.forEach(b => {
    csv += `"${b.team_name || 'Global'}","${b.budget_name || b.budget_id}",${b.allocated_amount || 0},${b.expenses_amount || 0},${b.unused_funds_returned || 0},${b.remaining_held_balance || 0}\n`;
  });
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.setAttribute('hidden', '');
  a.setAttribute('href', url);
  a.setAttribute('download', 'Global_Finance_Reconciliation.csv');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

window.loadFinanceDashboardData = loadFinanceDashboardData;
// renderFinanceTable bound directly to window above