const fs = require('fs');
let code = fs.readFileSync('src/utils/transferHelpers.js', 'utf8');

const oldFunc = `export function classifyTransferFlow(srcBucket, destBucket, senderIsOtl) {
  const srcOp = isOperationalBucket(srcBucket);
  const destOp = isOperationalBucket(destBucket);
  const destMember = isMemberBucket(destBucket);`;

const newFunc = `export function classifyTransferFlow(srcBucket, destBucket, senderIsOtl) {
  const srcOp = isOperationalBucket(srcBucket);
  const destOp = isOperationalBucket(destBucket);
  const destMember = isMemberBucket(destBucket);
  const srcOrg = srcBucket.is_org_level || srcBucket.is_system_bucket;
  const destOrg = destBucket.is_org_level || destBucket.is_system_bucket;
  
  if (srcOrg && !destOrg) {
    return {
      flow: 'org_to_team',
      status: 'PENDING',
      receiver_user_id: null,
      receiver_kind: 'otl' // Team lead needs to accept
    };
  }
  
  if (!srcOrg && destOrg) {
    return {
      flow: destBucket.name === 'UNUSED_FUNDS' ? 'unused_funds_return' : 'team_to_org',
      status: 'PENDING',
      receiver_user_id: null,
      receiver_kind: 'fih' // Finance needs to accept
    };
  }
  
  if (srcOrg && destOrg) {
    return {
      flow: 'org_to_team', // or org_to_org
      status: 'ACCEPTED', // Finance to Finance is instant
      receiver_user_id: null,
      receiver_kind: null
    };
  }`;

code = code.replace(oldFunc, newFunc);
fs.writeFileSync('src/utils/transferHelpers.js', code, 'utf8');
console.log('Fixed classifyTransferFlow');
