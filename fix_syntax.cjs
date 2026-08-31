const fs = require('fs');
let code = fs.readFileSync('src/pages/transfer.js', 'utf8');

const brokenCode = `  dests.filter(b => b.id !== srcId).forEach(b => {\n    const tag = isMemberBucket(b) ? ' · Member' : ' · Team';\n    const teamName = b.teams?.name ? \\` [\\${b.teams.name}]\\` : '';\n  if (crossSection) crossSection.style.display = lead ? '' : 'none';\n}`;

const correctCode = `  dests.filter(b => b.id !== srcId).forEach(b => {\n    const tag = isMemberBucket(b) ? ' · Member' : ' · Team';\n    const teamName = b.teams?.name ? \\` [\\${b.teams.name}]\\` : '';\n    select.innerHTML += \\`<option value=\\"\\${b.id}\\" data-currency=\\"\\${b.currency}\\">\\${escapeHtml(b.name)}\\${teamName}\\${tag} (\\${b.currency})</option>\\`;\n  });\n  if (dests.some(b => b.id === current && b.id !== srcId)) select.value = current;\n}\n\nimport { hasAnyGlobalFinanceRole } from '../utils/appRoles.js';\n\nfunction updateDestFilterVisibility() {\n  const lead = isTeamLeadAccess(state);\n  const globalAdmin = hasAnyGlobalFinanceRole();\n  const memberFilters = document.getElementById('trMemberFilters');\n  const otmFilters = document.getElementById('trOtmFilters');\n  const crossSection = document.getElementById('trCrossTeamSection');\n  if (memberFilters) memberFilters.style.display = (lead && !globalAdmin) ? '' : 'none';\n  if (otmFilters) otmFilters.style.display = (!lead || globalAdmin) ? '' : 'none';\n  if (crossSection) crossSection.style.display = lead ? '' : 'none';\n}`;

code = code.replace(brokenCode, correctCode);
fs.writeFileSync('src/pages/transfer.js', code);
console.log('Fixed transfer.js');