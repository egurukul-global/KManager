const fs = require('fs');
let code = fs.readFileSync('src/utils/transferHelpers.js', 'utf8');

const repl = `import { hasAnyGlobalFinanceRole } from './appRoles.js';
import { isTeamLeadAccess } from './teamAccess.js';

export function isOperationalBucket(bucket) {
  if (bucket.is_org_level === true) return false;
  return !bucket.owner_user_id;
}

export function isMemberBucket(bucket) {
  if (bucket.is_org_level === true) return false;
  return !!bucket.owner_user_id;
}

export function filterBucketsForTransferSource(buckets, state) {
  const lead = isTeamLeadAccess(state) || hasAnyGlobalFinanceRole();
  return buckets.filter(b => {
    if (b.is_org_level) return true;
    if (lead) return isOperationalBucket(b);
    return isMemberBucket(b) && b.owner_user_id === state.user?.id;
  });
}

export function filterBucketsForTransferDest(buckets, state, { showMembers = false, showTeam = false } = {}) {
  const lead = isTeamLeadAccess(state) || hasAnyGlobalFinanceRole();
  const operational = buckets.filter(isOperationalBucket);

  if (lead) {
    if (!showMembers) return operational.concat(buckets.filter(b => b.is_org_level));
    return buckets.filter(b => isOperationalBucket(b) || isMemberBucket(b) || b.is_org_level);
  }
  
  if (showTeam) return operational.concat(buckets.filter(b => b.is_org_level));
  return buckets.filter(b => (isMemberBucket(b) && b.owner_user_id === state.user?.id) || b.is_org_level);
}`;

// I'll just regex replace the bottom functions
code = code.replace(/export function isOperationalBucket[\s\S]*?b\.is_org_level\);\n\}/, repl);

fs.writeFileSync('src/utils/transferHelpers.js', code);
