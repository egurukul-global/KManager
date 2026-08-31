const fs = require('fs');
let code = fs.readFileSync('src/pages/buckets.js', 'utf8');

const targetInit = `  const teamCard = document.getElementById('teamBucketsCard');
  const level = String(state.userTeamAccess?.access_level || 'member').toLowerCase().trim();
  if (teamCard) {
    teamCard.style.display = isOpsStaff(level) ? 'none' : '';
  }`;

const replacementInit = `  const teamCard = document.getElementById('teamBucketsCard');
  const personalCard = document.getElementById('personalBucketsCard');
  const orgCard = document.getElementById('orgBucketsCard');
  
  const isGlobalView = state.activeViewContext === 'manager' || state.activeViewContext === 'admin';
  const level = String(state.userTeamAccess?.access_level || 'member').toLowerCase().trim();

  if (isGlobalView) {
    if (teamCard) teamCard.style.display = 'none';
    if (personalCard) personalCard.style.display = 'none';
    if (orgCard) orgCard.style.display = 'block';
    
    // Check if user is Org Admin (FIH, CEO, CAO, Admin)
    const role = String(state.user?.role || '').toLowerCase();
    if (['admin', 'ceo', 'caoh', 'oh'].includes(role)) {
      document.getElementById('addOrgBucketBtn').style.display = 'inline-block';
    }
    
    await loadOrgBuckets();
    return;
  } else {
    if (orgCard) orgCard.style.display = 'none';
    if (teamCard) teamCard.style.display = isOpsStaff(level) ? 'none' : '';
    if (personalCard) personalCard.style.display = 'block';
  }`;

code = code.replace(targetInit, replacementInit);
fs.writeFileSync('src/pages/buckets.js', code, 'utf8');
