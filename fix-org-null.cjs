const fs = require('fs');
let code = fs.readFileSync('src/pages/transfer.js', 'utf8');

const regex = /const teamId = state\.currentTeam\?\.team_id;\n  if \(\!teamId\) \{\n    teamBucketsCache = \[\];\n    return \[\];\n  \}/;

const repl = `const teamId = state.currentTeam?.team_id;
  teamBucketsCache = [];
  if (teamId) {
    const result = await sbSelect('buckets', { teamId, orderBy: 'name', ascending: true });
    teamBucketsCache = (result.data || []).filter(b => !b.is_deleted);
  }`;

code = code.replace(regex, repl);

fs.writeFileSync('src/pages/transfer.js', code);
