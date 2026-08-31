const fs = require('fs');
let code = fs.readFileSync('src/utils/transferConstants.js', 'utf8');

const oldFlow = `export const TRANSFER_FLOW = {
  OTL_OPERATIONAL: 'otl_operational',
  OTL_TO_MEMBER: 'otl_to_member',
  OTM_TO_TEAM: 'otm_to_team',
  OTM_TO_MEMBER: 'otm_to_member',
  CROSS_TEAM_PERSONAL: 'otm_to_member'
};`;

const newFlow = `export const TRANSFER_FLOW = {
  OTL_OPERATIONAL: 'otl_operational',
  OTL_TO_MEMBER: 'otl_to_member',
  OTM_TO_TEAM: 'otm_to_team',
  OTM_TO_MEMBER: 'otm_to_member',
  CROSS_TEAM_PERSONAL: 'otm_to_member',
  ORG_TO_TEAM: 'org_to_team',
  TEAM_TO_ORG: 'team_to_org',
  UNUSED_FUNDS_RETURN: 'unused_funds_return'
};`;

code = code.replace(oldFlow, newFlow);
fs.writeFileSync('src/utils/transferConstants.js', code, 'utf8');
console.log('Fixed transferConstants.js');
