const fs = require('fs');
let code = fs.readFileSync('src/utils/transferHelpers.js', 'utf8');

const regex = /export function filterBucketsForTransferSource\(buckets, state\) \{[\s\S]*?owner_user_id === state\.user\?\.id;\n  \}\);\n\}/;
const repl = `import { isFinanceGlobalAdmin } from './appRoles.js';

export function filterBucketsForTransferSource(buckets, state) {
  const lead = isTeamLeadAccess(state) || hasAnyGlobalFinanceRole();
  return buckets.filter(b => {
    if (b.is_org_level) {
      if (isFinanceGlobalAdmin()) return true;
      return b._can_transfer === true;
    }
    if (lead) return isOperationalBucket(b);
    return isMemberBucket(b) && b.owner_user_id === state.user?.id;
  });
}`;

code = code.replace(regex, repl);
fs.writeFileSync('src/utils/transferHelpers.js', code);
