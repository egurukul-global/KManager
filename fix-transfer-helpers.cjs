const fs = require('fs');
let code = fs.readFileSync('src/utils/transferHelpers.js', 'utf8');

const targetSource = `export function filterBucketsForTransferSource(buckets, state) {
  const lead = isTeamLeadAccess(state);
  if (lead) {
    return buckets.filter(b => isOperationalBucket(b));
  }
  return buckets.filter(b => isMemberBucket(b) && b.owner_user_id === state.user?.id);
}`;

const replacementSource = `export function filterBucketsForTransferSource(buckets, state) {
  const lead = isTeamLeadAccess(state);
  return buckets.filter(b => {
    if (b.is_org_level) return true; // Any assigned org bucket is allowed as a source
    if (lead) return isOperationalBucket(b);
    return isMemberBucket(b) && b.owner_user_id === state.user?.id;
  });
}`;

const targetDest = `  if (lead) {
    if (!showMembers) return operational;
    return buckets.filter(b => isOperationalBucket(b) || isMemberBucket(b));
  }
  
  if (showTeam) return operational;
  return buckets.filter(b => isMemberBucket(b) && b.owner_user_id === state.user?.id);`;

const replacementDest = `  if (lead) {
    if (!showMembers) return operational.concat(buckets.filter(b => b.is_org_level));
    return buckets.filter(b => isOperationalBucket(b) || isMemberBucket(b) || b.is_org_level);
  }
  
  if (showTeam) return operational.concat(buckets.filter(b => b.is_org_level));
  return buckets.filter(b => (isMemberBucket(b) && b.owner_user_id === state.user?.id) || b.is_org_level);`;

code = code.replace(targetSource, replacementSource);
code = code.replace(targetDest, replacementDest);

fs.writeFileSync('src/utils/transferHelpers.js', code, 'utf8');
