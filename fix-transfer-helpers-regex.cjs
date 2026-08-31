const fs = require('fs');
let code = fs.readFileSync('src/utils/transferHelpers.js', 'utf8');

// Use regex to replace the source function
const sourceTarget = /export function filterBucketsForTransferSource\(buckets, state\) \{[\s\S]*?\n\}/;
const newSource = `export function filterBucketsForTransferSource(buckets, state) {
  const lead = isTeamLeadAccess(state) || ['admin', 'ceo', 'caoh', 'oh', 'fin', 'fip'].includes(String(state.user?.role || '').toLowerCase());
  return buckets.filter(b => {
    if (b.is_org_level) return true; // Any assigned org bucket is allowed as a source
    if (lead) return isOperationalBucket(b);
    return isMemberBucket(b) && b.owner_user_id === state.user?.id;
  });
}`;
if (sourceTarget.test(code)) {
  code = code.replace(sourceTarget, newSource);
  console.log('Replaced source');
}

// Use regex to replace the dest function
const destTarget = /export function filterBucketsForTransferDest\(buckets, state, \{ showMembers = false, showTeam = false \} = \{\}\) \{[\s\S]*?\n\}/;
const newDest = `export function filterBucketsForTransferDest(buckets, state, { showMembers = false, showTeam = false } = {}) {
  const lead = isTeamLeadAccess(state) || ['admin', 'ceo', 'caoh', 'oh', 'fin', 'fip'].includes(String(state.user?.role || '').toLowerCase());
  const operational = buckets.filter(isOperationalBucket);

  if (lead) {
    if (!showMembers) return operational.concat(buckets.filter(b => b.is_org_level));
    return buckets.filter(b => isOperationalBucket(b) || isMemberBucket(b) || b.is_org_level);
  }
  
  if (showTeam) return operational.concat(buckets.filter(b => b.is_org_level));
  return buckets.filter(b => (isMemberBucket(b) && b.owner_user_id === state.user?.id) || b.is_org_level);
}`;
if (destTarget.test(code)) {
  code = code.replace(destTarget, newDest);
  console.log('Replaced dest');
}

fs.writeFileSync('src/utils/transferHelpers.js', code, 'utf8');
