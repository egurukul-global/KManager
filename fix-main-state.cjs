const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');

const regex = /const \{ clearApprovalAccessCache \} = await import\('\.\/utils\/approvalAccess\.js'\);\n    clearApprovalAccessCache\(\);/;

const repl = `const { clearApprovalAccessCache } = await import('./utils/approvalAccess.js');
    clearApprovalAccessCache();
    state.appRoleAssignments = [];`;

code = code.replace(regex, repl);

const fetchRegex = /await loadOkAccess\(state\.user\.id\);/;
const fetchRepl = `await loadOkAccess(state.user.id);
    
    // 3b. Load generic app roles
    const { data: roleAssignments } = await supabaseClient
      .from('app_role_assignments')
      .select('*')
      .eq('user_id', state.user.id);
    state.appRoleAssignments = roleAssignments || [];`;

code = code.replace(fetchRegex, fetchRepl);

fs.writeFileSync('src/main.js', code);
