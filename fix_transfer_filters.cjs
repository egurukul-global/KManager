const fs = require('fs');
let code = fs.readFileSync('src/pages/transfer.js', 'utf8');

const updateVisibility = "function updateDestFilterVisibility() {\n" +
"  const lead = isTeamLeadAccess(state);\n" +
"  const globalAdmin = hasAnyGlobalFinanceRole();\n" +
"  const memberFilters = document.getElementById('trMemberFilters');\n" +
"  const otmFilters = document.getElementById('trOtmFilters');\n" +
"  const crossSection = document.getElementById('trCrossTeamSection');\n" +
"  if (memberFilters) memberFilters.style.display = (lead && !globalAdmin) ? '' : 'none';\n" +
"  if (otmFilters) otmFilters.style.display = (!lead || globalAdmin) ? '' : 'none';\n" +
"  if (crossSection) crossSection.style.display = lead ? '' : 'none';\n" +
"}\n";

const filterChange = "function onTransferDestFilterChange() {\n" +
"  const lead = isTeamLeadAccess(state);\n" +
"  const globalAdmin = hasAnyGlobalFinanceRole();\n" +
"  if (lead && !globalAdmin) {\n" +
"    destFilterState.showMembers = !!document.getElementById('trShowMembers')?.checked;\n" +
"  } else {\n" +
"    destFilterState.showTeam = !!document.getElementById('trShowTeamPeers')?.checked;\n" +
"    destFilterState.showMembers = !!document.getElementById('trShowMemberPeers')?.checked;\n" +
"  }\n" +
"  populateDestSelect();\n" +
"  onTransferBucketChange();\n" +
"}\n";

code = code.replace(/function updateDestFilterVisibility\(\) \{[\s\S]*?\}\n/, updateVisibility);
code = code.replace(/function onTransferDestFilterChange\(\) \{[\s\S]*?\}\n/, filterChange);

fs.writeFileSync('src/pages/transfer.js', code);
console.log('Fixed transfer.js filters');
