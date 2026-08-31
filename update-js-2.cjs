const fs = require('fs');
let code = fs.readFileSync('src/pages/manager-finance.js', 'utf8');

const jsRegex = /window\.renderFinanceTable = function\(\) \{[\s\S]*?if \(filtered\.length === 0\) \{/;

let jsReplacement = `let currentFinView = 'detailed';

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
      summaryMap[key].allocated += (b.allocated || 0);
      summaryMap[key].expenses += (b.expenses || 0);
      summaryMap[key].returned += (b.funds_returned || 0);
      summaryMap[key].count += 1;
    });

    const summaryGroups = Object.values(summaryMap).sort((a, b) => a.label.localeCompare(b.label));
    
    let thLabel = 'Team';
    if (groupBy === 'person') thLabel = 'Owner';
    if (groupBy === 'oph') thLabel = 'OPH';
    
    thead.innerHTML = "<tr><th>" + thLabel + "</th><th>Budget Count</th><th>Total Allocated</th><th>Total Expenses</th><th>Total Returned</th><th>Net Remaining Held</th></tr>";

    if (summaryGroups.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No records match criteria.</td></tr>';
      return;
    }

    tbody.innerHTML = summaryGroups.map(g => {
      const net = g.allocated - g.expenses - g.returned;
      const statusClass = net === 0 ? 'success' : (net < 0 ? 'error' : 'warning');
      return "<tr><td style=\"font-weight: bold;\">" + escapeHtml(g.label) + "</td><td>" + g.count + "</td><td>" + formatMoney(g.allocated, 'USD') + "</td><td>" + formatMoney(g.expenses, 'USD') + "</td><td>" + formatMoney(g.returned, 'USD') + "</td><td><span class=\"status-pill " + statusClass + "\">" + formatMoney(net, 'USD') + "</span></td></tr>";
    }).join('');
    
    return;
  }

  // Detailed View HTML Setup
  thead.innerHTML = "<tr><th>Team</th><th>Budget Plan</th><th>Allocated</th><th>Expenses Logged</th><th>Funds Returned</th><th>Remaining Held</th><th>Status</th></tr>";

  if (filtered.length === 0) {`;

code = code.replace(jsRegex, jsReplacement);
fs.writeFileSync('src/pages/manager-finance.js', code);
console.log('JS logic updated.');
