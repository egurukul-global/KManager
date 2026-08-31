const fs = require('fs');
let code = fs.readFileSync('src/pages/buckets.js', 'utf8');

const regex = /const teamCard = document\.getElementById\('teamBucketsCard'\);\s*const level = String\(state\.userTeamAccess\?\.access_level \|\| 'member'\)\.toLowerCase\(\)\.trim\(\);\s*if \(teamCard\) \{\s*teamCard\.style\.display = isOpsStaff\(level\) \? 'none' : '';\s*\}/;

const replacement = `const teamCard = document.getElementById('teamBucketsCard');
  const personalCard = document.getElementById('personalBucketsCard');
  const orgCard = document.getElementById('orgBucketsCard');
  
  const isGlobalView = state.activeViewContext === 'manager' || state.activeViewContext === 'admin';
  const level = String(state.userTeamAccess?.access_level || 'member').toLowerCase().trim();

  if (isGlobalView) {
    if (teamCard) teamCard.style.display = 'none';
    if (personalCard) personalCard.style.display = 'none';
    if (orgCard) orgCard.style.display = 'block';
    
    const role = String(state.user?.role || '').toLowerCase();
    if (['admin', 'ceo', 'caoh', 'oh'].includes(role)) {
      const addOrgBtn = document.getElementById('addOrgBucketBtn');
      if (addOrgBtn) addOrgBtn.style.display = 'inline-block';
    }
    
    if (typeof loadOrgBuckets === 'function') {
      await loadOrgBuckets();
    }
    return;
  } else {
    if (orgCard) orgCard.style.display = 'none';
    if (teamCard) teamCard.style.display = isOpsStaff(level) ? 'none' : '';
    if (personalCard) personalCard.style.display = 'block';
  }`;

if (regex.test(code)) {
  code = code.replace(regex, replacement);
  fs.writeFileSync('src/pages/buckets.js', code, 'utf8');
  console.log('Successfully replaced initBucketsPage');
} else {
  console.log('Failed to match regex');
}
