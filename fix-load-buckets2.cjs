const fs = require('fs');
let code = fs.readFileSync('src/pages/transfer.js', 'utf8');
const lines = code.split('\n');

const start = lines.findIndex(l => l.includes('async function loadTeamBuckets()'));
const end = lines.findIndex((l, i) => i > start && l.includes('return teamBucketsCache;'));

const repl = `async function loadTeamBuckets() {
  const teamId = state.currentTeam?.team_id;
  teamBucketsCache = [];
  
  if (teamId && teamId !== 'ALL' && teamId !== 'all') {
    const result = await sbSelect('buckets', { teamId, orderBy: 'name', ascending: true });
    teamBucketsCache = (result.data || []).filter(b => !b.is_deleted);
  }
  
  // Also fetch ORG buckets for global admins who need to transfer funds from ORG-BANK
  const lead = isTeamLeadAccess(state) || ['admin', 'ceo', 'caoh', 'cao', 'oh', 'fih', 'fin', 'fip'].includes(String(state.user?.role || '').toLowerCase());
  if (lead) {
    const orgResult = await window.supabaseClient.from('buckets').select('*').eq('is_org_level', true).eq('is_deleted', false);
    if (orgResult.data) {
      orgResult.data.forEach(orgB => {
        if (!teamBucketsCache.some(b => b.id === orgB.id)) {
          teamBucketsCache.push(orgB);
        }
      });
    }
  }
  
  return teamBucketsCache;`;

lines.splice(start, end - start + 1, repl);

code = lines.join('\n');
fs.writeFileSync('src/pages/transfer.js', code);
