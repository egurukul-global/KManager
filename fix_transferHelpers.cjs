const fs = require('fs');
let code = fs.readFileSync('src/utils/transferHelpers.js', 'utf8');

const correctFilter = "export function filterBucketsForTransferDest(buckets, state, { showMembers = false, showTeam = false } = {}) {\n" +
"  const lead = isTeamLeadAccess(state);\n" +
"  const globalAdmin = hasAnyGlobalFinanceRole();\n" +
"  const operational = buckets.filter(isOperationalBucket);\n" +
"  const orgLevel = buckets.filter(b => b.is_org_level);\n\n" +
"  if (globalAdmin) {\n" +
"    let result = [...orgLevel];\n" +
"    if (showTeam) result = result.concat(operational);\n" +
"    if (showMembers) result = result.concat(buckets.filter(isMemberBucket));\n" +
"    return result;\n" +
"  }\n\n" +
"  if (lead) {\n" +
"    if (!showMembers) return operational.concat(orgLevel);\n" +
"    return buckets.filter(b => isOperationalBucket(b) || isMemberBucket(b) || b.is_org_level);\n" +
"  }\n\n" +
"  if (showTeam) return operational.concat(orgLevel);\n" +
"  return buckets.filter(b => (isMemberBucket(b) && b.owner_user_id === state.user?.id) || b.is_org_level);\n" +
"}\n";

code = code.replace(/export function filterBucketsForTransferDest[\s\S]*?\}\n/, correctFilter);
fs.writeFileSync('src/utils/transferHelpers.js', code);
console.log('Fixed transferHelpers.js');
