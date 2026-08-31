const fs = require('fs');

let code = fs.readFileSync('src/pages/manager-finance.js', 'utf8');

// 1. Update Table Headers
const oldTableHead = `            <tr>
              <th>Budget ID</th>
              <th>Allocated</th>
              <th>Expenses Logged</th>
              <th>Funds Returned</th>
              <th>Remaining Held</th>
              <th>Status</th>
            </tr>`;
const newTableHead = `            <tr>
              <th>Team</th>
              <th>Budget Plan</th>
              <th>Allocated</th>
              <th>Expenses Logged</th>
              <th>Funds Returned</th>
              <th>Remaining Held</th>
              <th>Status</th>
            </tr>`;
code = code.replace(oldTableHead, newTableHead);

// 2. Update renderFinanceTable
const oldRender = /function renderFinanceTable\(\) \{[\s\S]*?\}\)\.join\(''\);\n\}/m;
const newRender = `function renderFinanceTable() {
  const tbody = document.getElementById('financeDashboardTableBody');
  if (!tbody) return;

  const statusFilter = document.getElementById('finStatusFilter')?.value || 'ALL';
  const teamFilter = document.getElementById('finTeamFilter')?.value || 'ALL';
  
  let filtered = cachedReconciliationData;

  if (teamFilter !== 'ALL') {
    filtered = filtered.filter(b => b.team_id === teamFilter);
  }

  if (statusFilter === 'OPEN') filtered = filtered.filter(b => b.remaining_held_balance > 0);
  if (statusFilter === 'CLOSED') filtered = filtered.filter(b => b.remaining_held_balance === 0);

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No budget records match criteria.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(b => {
    const isReconciled = b.remaining_held_balance === 0;
    const statusBadge = isReconciled ? '<span class="badge badge-success">Reconciled</span>' : '<span class="badge badge-warning">Open</span>';
    
    return \`
      <tr>
        <td>\${b.team_name || 'Global'}</td>
        <td>\${b.budget_name || (b.budget_id ? b.budget_id.substring(0,8) + '...' : 'Unknown')}</td>
        <td>$\${(b.allocated_amount || 0).toFixed(2)}</td>
        <td>$\${(b.expenses_amount || 0).toFixed(2)}</td>
        <td>$\${(b.unused_funds_returned || 0).toFixed(2)}</td>
        <td style="font-weight:bold; color: \${b.remaining_held_balance < 0 ? 'var(--error)' : 'var(--text)'};">$\${(b.remaining_held_balance || 0).toFixed(2)}</td>
        <td>\${statusBadge}</td>
      </tr>
    \`;
  }).join('');
}`;
code = code.replace(oldRender, newRender);

// 3. Populate Team Filter in loadFinanceDashboardData
const oldLoad = `    cachedReconciliationData = data || [];
    
    // Calculate Queues`;
const newLoad = `    cachedReconciliationData = data || [];
    
    // Populate Team Filter dynamically
    const finTeamFilter = document.getElementById('finTeamFilter');
    if (finTeamFilter) {
      const uniqueTeams = Array.from(new Set(cachedReconciliationData.map(b => b.team_id))).filter(id => id);
      const currentVal = finTeamFilter.value;
      finTeamFilter.innerHTML = '<option value="ALL">All Teams</option>' + uniqueTeams.map(id => {
        const teamName = cachedReconciliationData.find(b => b.team_id === id)?.team_name || 'Unknown Team';
        return \`<option value="\${id}">\${teamName}</option>\`;
      }).join('');
      if (uniqueTeams.includes(currentVal)) {
        finTeamFilter.value = currentVal;
      }
    }
    
    // Calculate Queues`;
code = code.replace(oldLoad, newLoad);

// 4. Fix CSV output
const oldCSV = /let csv = 'Budget ID,Team ID,Allocated Amount,Expenses Amount,Funds Returned,Remaining Balance\\n';[\s\S]*?csv \+= \`\$\{b\.budget_id\},\$\{b\.team_id\},\$\{b\.allocated_amount\},\$\{b\.expenses_amount\},\$\{b\.unused_funds_returned\},\$\{b\.remaining_held_balance\}\\n\`;/m;
const newCSV = `let csv = 'Team Name,Budget Name,Allocated Amount,Expenses Amount,Funds Returned,Remaining Balance\\n';
  cachedReconciliationData.forEach(b => {
    csv += \`"\${b.team_name || 'Global'}","\${b.budget_name || b.budget_id}",\${b.allocated_amount || 0},\${b.expenses_amount || 0},\${b.unused_funds_returned || 0},\${b.remaining_held_balance || 0}\\n\`;`;
code = code.replace(oldCSV, newCSV);

fs.writeFileSync('src/pages/manager-finance.js', code, 'utf8');
console.log('Fixed manager-finance.js completely');
