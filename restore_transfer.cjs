const fs = require('fs');
let code = fs.readFileSync('src/pages/transfer.js', 'utf8');

const correctCode = "  dests.filter(b => b.id !== srcId).forEach(b => {\n" +
"    const tag = isMemberBucket(b) ? ' · Member' : ' · Team';\n" +
"    const teamName = b.teams?.name ? ` [${b.teams.name}]` : '';\n" +
"    select.innerHTML += `<option value=\"${b.id}\" data-currency=\"${b.currency}\">${escapeHtml(b.name)}${teamName}${tag} (${b.currency})</option>`;\n" +
"  });\n" +
"  if (dests.some(b => b.id === current && b.id !== srcId)) select.value = current;\n" +
"}\n" +
"\n" +
"import { hasAnyGlobalFinanceRole } from '../utils/appRoles.js';\n" +
"\n" +
"function updateDestFilterVisibility() {\n" +
"  const lead = isTeamLeadAccess(state) || hasAnyGlobalFinanceRole();\n" +
"  const memberFilters = document.getElementById('trMemberFilters');\n" +
"  const otmFilters = document.getElementById('trOtmFilters');\n" +
"  const crossSection = document.getElementById('trCrossTeamSection');\n" +
"  if (memberFilters) memberFilters.style.display = lead ? '' : 'none';\n" +
"  if (otmFilters) otmFilters.style.display = lead ? 'none' : '';\n" +
"  if (crossSection) crossSection.style.display = lead ? '' : 'none';\n" +
"}\n";

code = code.replace(/dests\.filter\(b => b\.id !== srcId\)\.forEach\(b => \{[\s\S]*?if \(crossSection\) crossSection\.style\.display = lead \? '' : 'none';\n\}/, correctCode);
fs.writeFileSync('src/pages/transfer.js', code);
console.log('Restored updateDestFilterVisibility');
