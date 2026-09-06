// ==================== MANAGER - TEAM REPORT ====================
// Lists active, approved, non-closed budgets grouped by Team.
// Columns: Team | Approved Budget | Budget Amount | Approved Amount |
//          Allocated (Sent) | Received (Accepted) | Pending | Expenses
import { state } from '../state.js';
import { supabaseClient } from '../db.js';
window.supabaseClient = supabaseClient;
import { showToast } from '../components/toasts.js';
import { formatUsdDisplay } from '../utils/currency.js';
import { isFinanceGlobalAdmin } from '../utils/appRoles.js';

let cachedTeamReportData = [];

export function getManagerTeamReportPage() {
  const allowedRoles = ['admin', 'cao', 'caoh', 'ceo', 'oh', 'fin', 'fip', 'fih'];
  const userRole = String(state.user?.role || '').toLowerCase();
  if (!allowedRoles.includes(userRole) && !isFinanceGlobalAdmin()) {
    return `
      <h1 class="page-title">Team Report</h1>
      <div class="card">
        <h2>🔒 Access Denied</h2>
        <p>You do not have the required executive or finance permissions to view this report.</p>
      </div>
    `;
  }

  setTimeout(loadTeamReportData, 100);

  return `
    <h1 class="page-title">Team Report</h1>

    <div class="card">
      <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 10px;">
        <div class="form-group" style="flex: 0 0 140px; margin: 0;">
          <input type="date" id="trDateFrom" onchange="window.renderTeamReportTable()" title="From Date" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text);">
        </div>
        <div class="form-group" style="flex: 0 0 140px; margin: 0;">
          <input type="date" id="trDateTo" onchange="window.renderTeamReportTable()" title="To Date" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text);">
        </div>

        <div class="form-group" style="flex: 1; min-width: 180px; position: relative; margin: 0;">
          <div onclick="const d = document.getElementById('trTeamDropdown'); d.style.display = d.style.display === 'none' ? 'block' : 'none';" style="border:1px solid var(--border); padding:8px 12px; cursor:pointer; border-radius:4px; background:var(--bg-secondary); color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" id="trTeamLabel">All Teams</div>
          <div id="trTeamDropdown" onmouseleave="this.style.display='none'" style="display:none; position:absolute; top:100%; left:0; right:0; background:var(--bg, #fff); border:1px solid var(--border); z-index:10; max-height:250px; overflow-y:auto; padding:8px; box-shadow:0 8px 16px rgba(0,0,0,0.5);"></div>
        </div>

        <div class="form-group" style="flex: 1; min-width: 180px; position: relative; margin: 0;">
          <div onclick="const d = document.getElementById('trBudgetDropdown'); d.style.display = d.style.display === 'none' ? 'block' : 'none';" style="border:1px solid var(--border); padding:8px 12px; cursor:pointer; border-radius:4px; background:var(--bg-secondary); color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" id="trBudgetLabel">All Budgets</div>
          <div id="trBudgetDropdown" onmouseleave="this.style.display='none'" style="display:none; position:absolute; top:100%; left:0; right:0; background:var(--bg, #fff); border:1px solid var(--border); z-index:10; max-height:250px; overflow-y:auto; padding:8px; box-shadow:0 8px 16px rgba(0,0,0,0.5);"></div>
        </div>

        <div class="form-group" style="flex: 2; min-width: 200px; margin: 0;">
          <input type="text" id="trSearchInput" placeholder="Search by Team or Budget..." onkeyup="window.renderTeamReportTable()" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text);">
        </div>

        <div class="form-group" style="flex: 0 0 auto; margin: 0; display: flex; gap: 4px;">
          <button type="button" class="secondary small" onclick="window.exportTeamReportToCSV()" style="padding:8px 12px; font-size:0.85em;">CSV</button>
          <button type="button" class="secondary small" onclick="window.exportTeamReportToPDF()" style="padding:8px 12px; font-size:0.85em;">PDF</button>
        </div>
      </div>

      <div class="table-responsive" id="trTableContainer">
        <table class="data-table">
          <thead>
            <tr>
              <th>Team</th>
              <th>Approved Budget</th>
              <th>Budget</th>
              <th>Approved</th>
              <th>Allocated</th>
              <th>Received</th>
              <th>Pending</th>
              <th>Expenses</th>
            </tr>
          </thead>
          <tbody id="teamReportTableBody">
            <tr><td colspan="8" style="text-align:center;">Loading database view...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}


async function loadTeamReportData() {
  try {
    let query = window.supabaseClient
      .from('budget_reconciliation_view')
      .select('*')
      .neq('budget_status', 'ARCHIVE')
      .neq('budget_status', 'ARCHIVED')
      .neq('budget_status', 'CLOSED')
      .neq('budget_status', 'REJECTED');

    // RBAC: non-global users restricted to their teams
    const isGlobal = isFinanceGlobalAdmin() ||
      ['admin', 'caoh', 'ceo', 'fin', 'fip', 'fih'].includes(String(state.user?.role || '').toLowerCase());
    if (!isGlobal) {
      const userTeams = state.teams || [];
      const teamIds = userTeams.map(t => t.team_id);
      if (teamIds.length > 0) {
        query = query.in('team_id', teamIds);
      } else {
        cachedTeamReportData = [];
        renderTeamReportTable();
        return;
      }
    }

    const { data, error } = await query;
    if (error) throw error;

    cachedTeamReportData = data || [];

    // Populate Team & Budget multi-select filters
    const teamDropdown = document.getElementById('trTeamDropdown');
    const budgetDropdown = document.getElementById('trBudgetDropdown');
    if (teamDropdown && budgetDropdown) {
      const uniqueTeams = Array.from(new Set(cachedTeamReportData.map(b => b.team_id).filter(Boolean)));
      teamDropdown.innerHTML = '<label style="display:block; padding:4px; cursor:pointer;"><input type="checkbox" value="ALL" checked onchange="window.toggleAllTrFilters(this, \'team\')"> All Teams</label>' +
        uniqueTeams.map(id => {
          const teamName = cachedTeamReportData.find(b => b.team_id === id)?.team_name || 'Unknown Team';
          return `<label style="display:block; padding:4px; cursor:pointer;"><input type="checkbox" class="tr-team-cb" value="${id}" onchange="window.updateTrFilterLabels()"> ${teamName}</label>`;
        }).join('');

      const uniqueBudgets = Array.from(new Set(cachedTeamReportData.map(b => b.budget_id).filter(Boolean)));
      budgetDropdown.innerHTML = '<label style="display:block; padding:4px; cursor:pointer;"><input type="checkbox" value="ALL" checked onchange="window.toggleAllTrFilters(this, \'budget\')"> All Budgets</label>' +
        uniqueBudgets.map(id => {
          const bName = cachedTeamReportData.find(b => b.budget_id === id)?.budget_name || 'Unknown Budget';
          return `<label style="display:block; padding:4px; cursor:pointer;"><input type="checkbox" class="tr-budget-cb" value="${id}" onchange="window.updateTrFilterLabels()"> ${bName}</label>`;
        }).join('');
    }

    renderTeamReportTable();
  } catch (err) {
    console.error('Team Report load error:', err);
    showToast('Failed to load Team Report data: ' + err.message, 'error');
    const tbody = document.getElementById('teamReportTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Error loading data. Please refresh.</td></tr>';
  }
}

/** Approved budgets only: status must indicate an approved / paid flow. */
function isApprovedBudget(b) {
  const status = String(b.budget_status || '').toUpperCase();
  if (/REJECT|ARCHIV|CLOSED|DRAFT|PENDING/.test(status)) return false;
  return status === '' || /APPROVED|PAID|RECEIVED/.test(status);
}

function getFilteredTeamReportData() {
  const dateFrom = document.getElementById('trDateFrom')?.value || '';
  const dateTo = document.getElementById('trDateTo')?.value || '';
  const search = (document.getElementById('trSearchInput')?.value || '').toLowerCase().trim();

  const teamCbs = Array.from(document.querySelectorAll('.tr-team-cb:checked')).map(cb => cb.value);
  const teamsSelected = teamCbs.length > 0 && !teamCbs.includes('ALL') ? teamCbs : null;

  const budgetCbs = Array.from(document.querySelectorAll('.tr-budget-cb:checked')).map(cb => cb.value);
  const budgetsSelected = budgetCbs.length > 0 && !budgetCbs.includes('ALL') ? budgetCbs : null;

  return cachedTeamReportData.filter(b => {
    if (!isApprovedBudget(b)) return false;

    if (teamsSelected && !teamsSelected.includes(b.team_id)) return false;
    if (budgetsSelected && !budgetsSelected.includes(b.budget_id)) return false;

    const periodDate = b.budget_period_date || '';
    if (dateFrom && periodDate && periodDate < dateFrom) return false;
    if (dateTo && periodDate && periodDate > dateTo) return false;

    if (search) {
      const haystack = `${b.team_name || ''} ${b.budget_name || ''}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

window.renderTeamReportTable = function () {
  const tbody = document.getElementById('teamReportTableBody');
  if (!tbody) return;

  const filtered = getFilteredTeamReportData();

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No active approved budgets match the selected filters.</td></tr>';
    return;
  }

  const sorted = [...filtered].sort((a, b) =>
    String(a.team_name || 'Global').localeCompare(String(b.team_name || 'Global')) ||
    String(a.budget_name || '').localeCompare(String(b.budget_name || ''))
  );

  const rowsHtml = sorted.map(b => {
    const budgetAmount = b.approved_amount || 0;
    const approvedAmount = b.approved_amount || 0; // falls back to total until FIH-approved amount is set
    const allocated = b.allocated_amount || 0;
    const received = b.received_amount || 0;
    const pending = allocated - received;
    const expenses = b.expenses_amount || 0;

    return `
      <tr>
        <td>${b.team_name || 'Global'}</td>
        <td>${b.budget_name || (b.budget_id ? b.budget_id.substring(0, 8) + '...' : 'Unknown')}</td>
        <td>${formatUsdDisplay(budgetAmount)}</td>
        <td>${formatUsdDisplay(approvedAmount)}</td>
        <td>${formatUsdDisplay(allocated)}</td>
        <td>${formatUsdDisplay(received)}</td>
        <td style="color: ${pending > 0 ? 'var(--warning)' : 'inherit'};">${formatUsdDisplay(pending)}</td>
        <td>${formatUsdDisplay(expenses)}</td>
      </tr>
    `;
  }).join('');

  const totals = filtered.reduce((acc, b) => {
    acc.budget += b.approved_amount || 0;
    acc.approved += b.approved_amount || 0;
    acc.allocated += b.allocated_amount || 0;
    acc.received += b.received_amount || 0;
    acc.pending += (b.allocated_amount || 0) - (b.received_amount || 0);
    acc.expenses += b.expenses_amount || 0;
    return acc;
  }, { budget: 0, approved: 0, allocated: 0, received: 0, pending: 0, expenses: 0 });

  tbody.innerHTML = rowsHtml + `
    <tr style="font-weight: bold; border-top: 2px solid var(--border); background: var(--bg-secondary);">
      <td colspan="2">TOTAL (${filtered.length} budgets)</td>
      <td>${formatUsdDisplay(totals.budget)}</td>
      <td>${formatUsdDisplay(totals.approved)}</td>
      <td>${formatUsdDisplay(totals.allocated)}</td>
      <td>${formatUsdDisplay(totals.received)}</td>
      <td>${formatUsdDisplay(totals.pending)}</td>
      <td>${formatUsdDisplay(totals.expenses)}</td>
    </tr>
  `;
};

window.toggleAllTrFilters = function (checkbox, type) {
  const cls = type === 'team' ? '.tr-team-cb' : '.tr-budget-cb';
  document.querySelectorAll(cls).forEach(cb => { cb.checked = checkbox.checked; });
  updateTrFilterLabels();
};

window.updateTrFilterLabels = function () {
  const teamCbs = Array.from(document.querySelectorAll('.tr-team-cb'));
  const teamChecked = teamCbs.filter(cb => cb.checked).length;
  const allTeamsCb = document.querySelector('#trTeamDropdown input[value="ALL"]');
  if (allTeamsCb) allTeamsCb.checked = teamChecked === teamCbs.length;
  const teamLabel = document.getElementById('trTeamLabel');
  if (teamLabel) teamLabel.textContent = (teamCbs.length === 0 || teamChecked === teamCbs.length) ? 'All Teams' : `${teamChecked} team(s) selected`;

  const budgetCbs = Array.from(document.querySelectorAll('.tr-budget-cb'));
  const budgetChecked = budgetCbs.filter(cb => cb.checked).length;
  const allBudgetsCb = document.querySelector('#trBudgetDropdown input[value="ALL"]');
  if (allBudgetsCb) allBudgetsCb.checked = budgetChecked === budgetCbs.length;
  const budgetLabel = document.getElementById('trBudgetLabel');
  if (budgetLabel) budgetLabel.textContent = (budgetCbs.length === 0 || budgetChecked === budgetCbs.length) ? 'All Budgets' : `${budgetChecked} budget(s) selected`;

  renderTeamReportTable();
};
window.exportTeamReportToCSV = function () {
  const filtered = getFilteredTeamReportData();
  if (!filtered.length) {
    showToast('No data to export for the current filters.', 'warning');
    return;
  }
  const sorted = [...filtered].sort((a, b) =>
    String(a.team_name || 'Global').localeCompare(String(b.team_name || 'Global')) ||
    String(a.budget_name || '').localeCompare(String(b.budget_name || ''))
  );
  const rows = sorted.map(b => ({
    'Team': b.team_name || 'Global',
    'Approved Budget': b.budget_name || b.budget_id,
    'Budget': (b.approved_amount || 0).toFixed(2),
    'Approved': (b.approved_amount || 0).toFixed(2),
    'Allocated': (b.allocated_amount || 0).toFixed(2),
    'Received': (b.received_amount || 0).toFixed(2),
    'Pending': ((b.allocated_amount || 0) - (b.received_amount || 0)).toFixed(2),
    'Expenses': (b.expenses_amount || 0).toFixed(2)
  }));
  const headers = Object.keys(rows[0]);
  import('../utils/exportCsv.js').then(m => {
    m.downloadCSV('Team_Report_' + new Date().toISOString().slice(0, 10) + '.csv', m.convertArrayOfObjectsToCSV(rows, headers));
    showToast('Team Report CSV downloaded.', 'success');
  });
};

window.exportTeamReportToPDF = function () {
  const filtered = getFilteredTeamReportData();
  if (!filtered.length) {
    showToast('No data to export for the current filters.', 'warning');
    return;
  }
  try {
    const pdfLib = window.pdfMake;
    if (!pdfLib) throw new Error('pdfmake is not loaded');
    const sorted = [...filtered].sort((a, b) =>
      String(a.team_name || 'Global').localeCompare(String(b.team_name || 'Global')) ||
      String(a.budget_name || '').localeCompare(String(b.budget_name || ''))
    );
    const rows = sorted.map(b => [
      b.team_name || 'Global',
      b.budget_name || (b.budget_id || '').substring(0, 8),
      '$' + (b.approved_amount || 0).toFixed(2),
      '$' + (b.approved_amount || 0).toFixed(2),
      '$' + (b.allocated_amount || 0).toFixed(2),
      '$' + (b.received_amount || 0).toFixed(2),
      '$' + ((b.allocated_amount || 0) - (b.received_amount || 0)).toFixed(2),
      '$' + (b.expenses_amount || 0).toFixed(2)
    ]);
    pdfLib.createPdf({
      content: [
        { text: 'Team Report', style: 'header' },
        { text: 'Generated on: ' + new Date().toLocaleString(), margin: [0, 0, 0, 10] },
        {
          table: {
            headerRows: 1,
            widths: ['auto', '*', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto'],
            body: [
              ['Team', 'Approved Budget', 'Budget', 'Approved', 'Allocated', 'Received', 'Pending', 'Expenses'],
              ...rows
            ]
          }
        }
      ],
      styles: { header: { fontSize: 18, bold: true, margin: [0, 0, 0, 10] } }
    }).download('Team_Report_' + new Date().toISOString().slice(0, 10) + '.pdf');
  } catch (e) {
    console.error(e);
    showToast('Failed to generate PDF: ' + e.message, 'error');
  }
};

window.loadTeamReportData = loadTeamReportData;


