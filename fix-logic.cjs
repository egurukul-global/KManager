const fs = require('fs');

// 1. Update profile.js
let profCode = fs.readFileSync('src/pages/profile.js', 'utf8');
const oldProfPop = /const role = String\(state\.user\?\.role \|\| ''\)\.toLowerCase\(\);\s*const isAdmin = \['admin', 'caoh', 'oh', 'ceo'\]\.includes\(role\);\s*const isManager = \['fin', 'fip'\]\.includes\(role\) \|\| state\.userTeamAccess\?\.access_level === 'lead';/m;
const newProfPop = `const allowed = state.user?.allowed_views || ['team'];
    const isAdmin = allowed.includes('admin');
    const isManager = allowed.includes('manager');`;
if (oldProfPop.test(profCode)) {
  profCode = profCode.replace(oldProfPop, newProfPop);
  // Also fix the if (isAdmin || isManager) for manager view, since we decoupled them
  profCode = profCode.replace(`if (isAdmin || isManager) {\n      viewSelect.innerHTML += '<option value="manager">Manager View (Finance)</option>';`, `if (isManager) {\n      viewSelect.innerHTML += '<option value="manager">Manager View (Finance)</option>';`);
  fs.writeFileSync('src/pages/profile.js', profCode, 'utf8');
  console.log('Fixed profile.js');
} else {
  console.log('Failed to match profile.js logic');
}

// 2. Update teamAccess.js
let teamCode = fs.readFileSync('src/utils/teamAccess.js', 'utf8');
const oldTeamPop = /const role = String\(state\.user\.role \|\| ''\)\.toLowerCase\(\);\s*const isAdmin = \['admin', 'caoh', 'oh', 'ceo'\]\.includes\(role\);\s*const isManager = \['fin', 'fip'\]\.includes\(role\) \|\| state\.userTeamAccess\?\.access_level === 'lead';/m;
if (oldTeamPop.test(teamCode)) {
  teamCode = teamCode.replace(oldTeamPop, newProfPop);
  teamCode = teamCode.replace(`if (isAdmin || isManager) html += '<option value="manager">Manager</option>';`, `if (isManager) html += '<option value="manager">Manager</option>';`);
  fs.writeFileSync('src/utils/teamAccess.js', teamCode, 'utf8');
  console.log('Fixed teamAccess.js');
} else {
  console.log('Failed to match teamAccess.js logic');
}

// 3. Ensure allowed_views is selected in auth login!
let mainCode = fs.readFileSync('src/main.js', 'utf8');
// state.user is populated by getSession() usually, which fetches users. Or checkAuth().
