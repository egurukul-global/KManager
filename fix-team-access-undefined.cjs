const fs = require('fs');
let code = fs.readFileSync('src/utils/teamAccess.js', 'utf8');

const regex = /state\.userTeamAccess = \{\s*access_level: String\(state\.currentTeam\.access_level \|\| 'member'\)\.toLowerCase\(\)\.trim\(\),\s*granted_by: state\.currentTeam\.granted_by,\s*granted_at: state\.currentTeam\.granted_at\s*\};/;

const newLogic = `  if (state.currentTeam) {
    state.userTeamAccess = {
      access_level: String(state.currentTeam.access_level || 'member').toLowerCase().trim(),
      granted_by: state.currentTeam.granted_by,
      granted_at: state.currentTeam.granted_at
    };
  } else {
    state.userTeamAccess = { access_level: 'member' };
  }`;

code = code.replace(regex, newLogic);
fs.writeFileSync('src/utils/teamAccess.js', code);
