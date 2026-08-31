const fs = require('fs');
let code = fs.readFileSync('src/utils/transferHelpers.js', 'utf8');

const regex = /import \{ isTeamLeadAccess \} from '\.\/teamAccess\.js';/;
const repl = `export function isTeamLeadAccess(state) {
  if (state.user?.role === 'admin' || state.user?.role === 'ceo') return true;
  const level = String(state.userTeamAccess?.access_level || '').toLowerCase().trim();
  return level === 'admin' || level === 'lead' || level === 'oht';
}`;

code = code.replace(regex, repl);
fs.writeFileSync('src/utils/transferHelpers.js', code);
