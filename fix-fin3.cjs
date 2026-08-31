const fs = require('fs');
let code = fs.readFileSync('src/pages/manager-finance.js', 'utf8');

// 1. Update loadFinanceDashboardData to populate checkboxes
const oldLoadPopulate = /    \/\/ Populate Team Filter dynamically[\s\S]*?\/\/ Calculate Queues/m;
const newLoadPopulate = `    // Populate Team & Budget Filters dynamically
    const finTeamDropdown = document.getElementById('finTeamDropdown');
    const finBudgetDropdown = document.getElementById('finBudgetDropdown');
    
    if (finTeamDropdown && finBudgetDropdown) {
      const uniqueTeams = Array.from(new Set(cachedReconciliationData.map(b => b.team_id))).filter(id => id);
      const uniqueBudgets = Array.from(new Set(cachedReconciliationData.map(b => b.budget_id))).filter(id => id);
      
      finTeamDropdown.innerHTML = '<label style="display:block; padding:4px; cursor:pointer;"><input type="checkbox" value="ALL" checked onchange="window.toggleAllFinFilters(this, \\'team\\')"> All Teams</label>' + 
        uniqueTeams.map(id => {
          const teamName = cachedReconciliationData.find(b => b.team_id === id)?.team_name || 'Unknown Team';
          return \`<label style="display:block; padding:4px; cursor:pointer;"><input type="checkbox" class="fin-team-cb" value="\${id}" onchange="window.updateFinFilterLabels()"> \${teamName}</label>\`;
        }).join('');
        
      finBudgetDropdown.innerHTML = '<label style="display:block; padding:4px; cursor:pointer;"><input type="checkbox" value="ALL" checked onchange="window.toggleAllFinFilters(this, \\'budget\\')"> All Budgets</label>' + 
        uniqueBudgets.map(id => {
          const bName = cachedReconciliationData.find(b => b.budget_id === id)?.budget_name || (id.substring(0,8) + '...');
          return \`<label style="display:block; padding:4px; cursor:pointer;"><input type="checkbox" class="fin-budget-cb" value="\${id}" onchange="window.updateFinFilterLabels()"> \${bName}</label>\`;
        }).join('');
    }
    
    // Calculate Queues`;
code = code.replace(oldLoadPopulate, newLoadPopulate);

// 2. Remove the stub qPastDeadline calculation
code = code.replace("document.getElementById('qPastDeadline').textContent = '0'; // Stub for deadline logic\n    ", "");

// 3. Replace renderFinanceTable
const oldRender = /function renderFinanceTable\(\) \{[\s\S]*?\}\)\.join\(''\);\n\}/m;
const newRender = `window.toggleAllFinFilters = function(cb, type) {
  const cbs = document.querySelectorAll(\`.fin-\${type}-cb\`);
  cbs.forEach(c => c.checked = false);
  window.updateFinFilterLabels();
};

window.updateFinFilterLabels = function() {
  const teamCbs = Array.from(document.querySelectorAll('.fin-team-cb:checked'));
  const teamAll = document.querySelector('#finTeamDropdown input[value="ALL"]');
  if (teamCbs.length > 0 && teamAll) teamAll.checked = false;
  if (teamCbs.length === 0 && teamAll) teamAll.checked = true;
  document.getElementById('finTeamLabel').textContent = teamCbs.length === 0 ? 'All Teams' : \`\${teamCbs.length} selected\`;

  const budgetCbs = Array.from(document.querySelectorAll('.fin-budget-cb:checked'));
  const budgetAll = document.querySelector('#finBudgetDropdown input[value="ALL"]');
  if (budgetCbs.length > 0 && budgetAll) budgetAll.checked = false;
  if (budgetCbs.length === 0 && budgetAll) budgetAll.checked = true;
  document.getElementById('finBudgetLabel').textContent = budgetCbs.length === 0 ? 'All Budgets' : \`\${budgetCbs.length} selected\`;

  window.renderFinanceTable();
};

window.renderFinanceTable = function() {
  const tbody = document.getElementById('financeDashboardTableBody');
  if (!tbody) return;

  const statusFilter = document.getElementById('finStatusFilter')?.value || 'ALL';
  const teamAll = document.querySelector('#finTeamDropdown input[value="ALL"]')?.checked !== false;
  const teamChecked = Array.from(document.querySelectorAll('.fin-team-cb:checked')).map(c => c.value);
  
  const budgetAll = document.querySelector('#finBudgetDropdown input[value="ALL"]')?.checked !== false;
  const budgetChecked = Array.from(document.querySelectorAll('.fin-budget-cb:checked')).map(c => c.value);
  
  let filtered = cachedReconciliationData;

  if (!teamAll && teamChecked.length > 0) {
    filtered = filtered.filter(b => teamChecked.includes(b.team_id));
  }
  if (!budgetAll && budgetChecked.length > 0) {
    filtered = filtered.filter(b => budgetChecked.includes(b.budget_id));
  }

  if (statusFilter === 'OPEN') filtered = filtered.filter(b => b.remaining_held_balance > 0);
  if (statusFilter === 'CLOSED') filtered = filtered.filter(b => b.remaining_held_balance === 0);
  if (statusFilter === 'ERROR') filtered = filtered.filter(b => b.remaining_held_balance < 0);

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
    
    return \`
      <tr>
        <td>\${b.team_name || 'Global'}</td>
        <td>\${b.budget_name || (b.budget_id ? b.budget_id.substring(0,8) + '...' : 'Unknown')}</td>
        <td>$\${(b.allocated_amount || 0).toFixed(2)}</td>
        <td>$\${(b.expenses_amount || 0).toFixed(2)}</td>
        <td>$\${(b.unused_funds_returned || 0).toFixed(2)}</td>
        <td style="font-weight:bold; color: \${isError ? 'var(--error)' : 'var(--text)'};">$\${(b.remaining_held_balance || 0).toFixed(2)}</td>
        <td>\${statusBadge}</td>
      </tr>
    \`;
  }).join('');
}`;
code = code.replace(oldRender, newRender);

// 4. Update function exports
const oldExports = "window.loadFinanceDashboardData = loadFinanceDashboardData;\n  window.renderFinanceTable = renderFinanceTable;";
const newExports = "window.loadFinanceDashboardData = loadFinanceDashboardData;\n  // renderFinanceTable bound directly to window above";
code = code.replace(oldExports, newExports);

// 5. PDF Download Function
const oldCsvFunc = "async function exportFinanceReportToCSV() {";
const pdfFunc = `window.exportFinanceReportToPDF = function() {
  if (!cachedReconciliationData.length) {
    alert('No data to export.');
    return;
  }
  try {
    const rows = cachedReconciliationData.map(b => [
      b.team_name || 'Global',
      b.budget_name || b.budget_id.substring(0,8),
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

async function exportFinanceReportToCSV() {`;
code = code.replace(oldCsvFunc, pdfFunc);

fs.writeFileSync('src/pages/manager-finance.js', code, 'utf8');
console.log('Fixed manager-finance JS logic completely');
