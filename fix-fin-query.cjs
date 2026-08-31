const fs = require('fs');
let code = fs.readFileSync('src/pages/manager-finance.js', 'utf8');

code = code.replace(
  'const teamIds = userTeams.map(t => t.id);',
  'const teamIds = userTeams.map(t => t.team_id);'
);

fs.writeFileSync('src/pages/manager-finance.js', code, 'utf8');
