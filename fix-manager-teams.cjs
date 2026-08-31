const fs = require('fs');
let code = fs.readFileSync('src/pages/manager-finance.js', 'utf8');

const badTeams = `      const userTeams = state.userTeams || [];
      const teamIds = userTeams.map(ut => ut.team_id);`;

const goodTeams = `      const userTeams = state.teams || [];
      const teamIds = userTeams.map(t => t.id);`;

if (code.includes(badTeams)) {
  code = code.replace(badTeams, goodTeams);
  fs.writeFileSync('src/pages/manager-finance.js', code, 'utf8');
}
console.log('Fixed state.teams reference');
