const fs = require('fs');
let code = fs.readFileSync('src/pages/manager-finance.js', 'utf8');

const oldCode = `    let query = sbSelect('budget_reconciliation_view', {});
    
    if (!isGlobal) {
      // FIP / FIN scope-restriction logic here. 
      const userTeams = state.teams || [];
      const teamIds = userTeams.map(t => t.id);
      if (teamIds.length > 0) {
        query = sbSelect('budget_reconciliation_view', { in: { column: 'team_id', values: teamIds } });
      } else {
        renderFinanceTable();
        return;
      }
    }

    const { data, error } = await query;`;

const newCode = `    let query = window.supabaseClient.from('budget_reconciliation_view').select('*');
    
    if (!isGlobal) {
      const userTeams = state.teams || [];
      const teamIds = userTeams.map(t => t.id);
      if (teamIds.length > 0) {
        query = query.in('team_id', teamIds);
      } else {
        renderFinanceTable();
        return;
      }
    }

    const { data, error } = await query;`;

code = code.replace(oldCode, newCode);

const oldPending = `const pendingTransfers = await sbSelect('transfers', { status: 'PENDING' });`;
const newPending = `const pendingTransfers = await window.supabaseClient.from('transfers').select('id').eq('status', 'PENDING').eq('is_deleted', false);`;

code = code.replace(oldPending, newPending);

// Need to import supabaseClient!
if (!code.includes('import { supabaseClient } from')) {
  code = code.replace("import { sbSelect } from '../db.js';", "import { sbSelect, supabaseClient } from '../db.js';\nwindow.supabaseClient = supabaseClient;");
} else {
  code = code.replace("import { sbSelect }", "import { sbSelect, supabaseClient }");
  code = code.replace("import { state }", "import { state }");
}

fs.writeFileSync('src/pages/manager-finance.js', code, 'utf8');
console.log('Fixed manager-finance queries');
