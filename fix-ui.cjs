const fs = require('fs');

// 1. Fix main.js label
let mainJs = fs.readFileSync('src/main.js', 'utf8');
mainJs = mainJs.replace('<label style="margin:0; white-space:nowrap; font-size:0.7em; text-transform:uppercase; letter-spacing:0.5px; opacity:0.7;">Team</label>', '<label for="teamSelect" style="margin:0; white-space:nowrap; font-size:0.7em; text-transform:uppercase; letter-spacing:0.5px; opacity:0.7;">Team</label>');
fs.writeFileSync('src/main.js', mainJs);

// 2. Fix buckets.js modal creation
let bucketsJs = fs.readFileSync('src/pages/buckets.js', 'utf8');
bucketsJs = bucketsJs.replace('<h2>${isEdit ? \'✏️ Edit Bucket\' : \'➕ Add New Bucket\'}</h2>', '<h2 id="bucketModalTitle">${isEdit ? \'✏️ Edit Bucket\' : \'➕ Add New Bucket\'}</h2>');

const oldOpenOrg = `window.openOrgBucketModal = function() {
  // We can reuse the existing bucket modal but configure it for org buckets
  const modal = document.getElementById('bucketModal');
  if (!modal) return;`;

const newOpenOrg = `window.openOrgBucketModal = function() {
  openBucketModal();
  const modal = document.getElementById('bucketModal');
  if (!modal) return;
  const pCheck = document.getElementById('bucketPersonal');
  if (pCheck && pCheck.parentElement && pCheck.parentElement.parentElement) pCheck.parentElement.parentElement.style.display = 'none';
`;

bucketsJs = bucketsJs.replace(oldOpenOrg, newOpenOrg);
fs.writeFileSync('src/pages/buckets.js', bucketsJs);

// 3. Fix transfer.js caching for FIH
let transferJs = fs.readFileSync('src/pages/transfer.js', 'utf8');
const oldLoadTeam = `  if (teamId && teamId !== 'ALL' && teamId !== 'all') {
    const result = await sbSelect('buckets', { teamId, orderBy: 'name', ascending: true });
    teamBucketsCache = (result.data || []).filter(b => !b.is_deleted);
  }`;

const newLoadTeam = `  if (teamId && teamId !== 'ALL' && teamId !== 'all') {
    const result = await sbSelect('buckets', { teamId, orderBy: 'name', ascending: true });
    teamBucketsCache = (result.data || []).filter(b => !b.is_deleted);
  } else if (isFinanceGlobalAdmin()) {
    const { data } = await supabaseClient.from('buckets').select('*, teams(name)').eq('is_org_level', false).eq('is_deleted', false).order('name');
    teamBucketsCache = data || [];
  }`;

transferJs = transferJs.replace(oldLoadTeam, newLoadTeam);

const oldPopSrc = `    const tag = isMemberBucket(b) ? ' · Personal' : '';
    select.innerHTML += \`<option value="\${b.id}" data-currency="\${b.currency}">\${escapeHtml(b.name)}\${tag} (\${b.currency})</option>\`;`;

const newPopSrc = `    const tag = isMemberBucket(b) ? ' · Personal' : '';
    const teamName = b.teams?.name ? \` [\${b.teams.name}]\` : '';
    select.innerHTML += \`<option value="\${b.id}" data-currency="\${b.currency}">\${escapeHtml(b.name)}\${teamName}\${tag} (\${b.currency})</option>\`;`;

transferJs = transferJs.replace(oldPopSrc, newPopSrc);

const oldPopDest = `    const tag = isMemberBucket(b) ? ' · Member' : ' · Team';
    select.innerHTML += \`<option value="\${b.id}" data-currency="\${b.currency}">\${escapeHtml(b.name)}\${tag} (\${b.currency})</option>\`;`;

const newPopDest = `    const tag = isMemberBucket(b) ? ' · Member' : ' · Team';
    const teamName = b.teams?.name ? \` [\${b.teams.name}]\` : '';
    select.innerHTML += \`<option value="\${b.id}" data-currency="\${b.currency}">\${escapeHtml(b.name)}\${teamName}\${tag} (\${b.currency})</option>\`;`;

transferJs = transferJs.replace(oldPopDest, newPopDest);

fs.writeFileSync('src/pages/transfer.js', transferJs);
