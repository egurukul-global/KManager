const fs = require('fs');
let code = fs.readFileSync('src/pages/transfer.js', 'utf8');

const regex = /async function loadTeamBuckets\(\) \{[\s\S]*?return teamBucketsCache;\n\}/;

const repl = `async function loadTeamBuckets() {
  const teamId = state.currentTeam?.team_id;
  teamBucketsCache = [];
  
  if (teamId && teamId !== 'ALL' && teamId !== 'all') {
    const result = await sbSelect('buckets', { teamId, orderBy: 'name', ascending: true });
    teamBucketsCache = (result.data || []).filter(b => !b.is_deleted);
  }
  
  const isGlobalAdmin = isFinanceGlobalAdmin();
  let orgResult;
  
  if (isGlobalAdmin) {
    orgResult = await supabaseClient.from('buckets').select('*').eq('is_org_level', true).eq('is_deleted', false);
  } else {
    const { data: bAccess } = await supabaseClient
      .from('bucket_access')
      .select('bucket_id, can_transfer, can_view_balance')
      .eq('user_id', state.user.id);
      
    orgResult = await supabaseClient
      .from('buckets')
      .select('*')
      .eq('is_org_level', true)
      .eq('is_deleted', false);
        
    if (orgResult.data) {
      orgResult.data.forEach(b => {
        const acc = (bAccess || []).find(a => a.bucket_id === b.id);
        b._can_view_balance = acc ? acc.can_view_balance : false;
      });
    }
  }

  if (orgResult && orgResult.data) {
    orgResult.data.forEach(orgB => {
      if (!teamBucketsCache.some(b => b.id === orgB.id)) {
        if (isGlobalAdmin) orgB._can_view_balance = true;
        teamBucketsCache.push(orgB);
      }
    });
  }
  
  return teamBucketsCache;
}`;

code = code.replace(regex, repl);
fs.writeFileSync('src/pages/transfer.js', code);
