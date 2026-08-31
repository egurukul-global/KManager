const fs = require('fs');
let code = fs.readFileSync('src/pages/manager-expenses.js', 'utf8');

// Replace onchange for Team and Budget
code = code.replace(
  '<select id="mgrExpTeamFilter" onchange="window.refreshManagerExpenseList()">',
  '<select id="mgrExpTeamFilter" onchange="window.reloadManagerExpensesFromServer()">'
);

// Add the global reload function
const reloadFunc = `
window.reloadManagerExpensesFromServer = async function() {
  await loadPendingExpenses();
};

window.refreshManagerExpenseList = function() {
`;
code = code.replace('window.refreshManagerExpenseList = function() {', reloadFunc);

// Fix loadPendingExpenses
const oldLoad = `  let query = supabaseClient
    .from('expenses')
    .select('id, date, item, usd_amount, local_amount, currency, receipt_url, budget_id, category_id, bucket_id, is_reviewed, is_submitted, team_id, teams(name), budget_plans(name), categories(name), vendor_info')
    .eq('is_deleted', false)
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
  }`;

const newLoad = `  // Populate team dropdown independently if empty
  const teamSel = document.getElementById('mgrExpTeamFilter');
  if (teamSel && teamSel.options.length <= 1) {
    if (isGlobal) {
      const { data: allTeams } = await supabaseClient.from('teams').select('id, name').eq('is_deleted', false).order('name');
      if (allTeams) {
        allTeams.forEach(t => {
          teamSel.innerHTML += \`<option value="\${t.id}">\${escapeHtml(t.name)}</option>\`;
        });
      }
    } else {
      const userTeams = state.teams || [];
      userTeams.forEach(t => {
        teamSel.innerHTML += \`<option value="\${t.team_id}">\${escapeHtml(t.team_name)}</option>\`;
      });
    }
  }

  const tId = teamSel?.value || '';

  let query = supabaseClient
    .from('expenses')
    .select('id, date, item, usd_amount, local_amount, currency, receipt_url, budget_id, category_id, bucket_id, is_reviewed, is_submitted, team_id, teams(name), budget_plans(name), categories(name), vendor_info')
    .eq('is_deleted', false)
    .order('date', { ascending: false });
    
  if (tId) {
    query = query.eq('team_id', tId);
  } else if (!isGlobal) {
    const userTeams = state.teams || [];
    const teamIds = userTeams.map(t => t.team_id);
    if (teamIds.length > 0) {
      query = query.in('team_id', teamIds);
    } else {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">No teams assigned to you.</td></tr>';
      return;
    }
  }`;

code = code.replace(oldLoad, newLoad);

// Remove old dropdown population for teams
const oldPop = `  // Populate dropdowns once
  const teamSel = document.getElementById('mgrExpTeamFilter');
  const budSel = document.getElementById('mgrExpBudgetFilter');
  if (teamSel && teamSel.options.length <= 1) {
    const teams = [...new Set(pendingReviewsCache.map(e => e.team_id))];
    teams.forEach(tid => {
      const name = pendingReviewsCache.find(e => e.team_id === tid)?.teams?.name || 'Unknown';
      teamSel.innerHTML += \`<option value="\${tid}">\${escapeHtml(name)}</option>\`;
    });
  }`;

const newPop = `  // Populate dropdowns once
  const budSel = document.getElementById('mgrExpBudgetFilter');`;

code = code.replace(oldPop, newPop);

fs.writeFileSync('src/pages/manager-expenses.js', code);
