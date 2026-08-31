const fs = require('fs');
let code = fs.readFileSync('src/pages/transfer.js', 'utf8');

const targetLoad = `async function loadTeamBuckets() {
  const teamId = state.currentTeam?.team_id;
  if (!teamId) {
    teamBucketsCache = [];
    return [];
  }
  const result = await sbSelect('buckets', { teamId, orderBy: 'name', ascending: true });
  teamBucketsCache = (result.data || []).filter(b => !b.is_deleted);
  return teamBucketsCache;
}`;

const replacementLoad = `async function loadTeamBuckets() {
  const teamId = state.currentTeam?.team_id;
  if (!teamId) {
    teamBucketsCache = [];
    return [];
  }
  
  // Fetch team buckets
  const result = await sbSelect('buckets', { teamId, orderBy: 'name', ascending: true });
  let buckets = (result.data || []).filter(b => !b.is_deleted);
  
  // Fetch org buckets assigned to this user
  try {
    const { data: orgData } = await supabaseClient
      .from('bucket_access')
      .select('buckets(*)')
      .eq('user_id', state.user.id)
      .eq('can_transfer', true);
      
    if (orgData) {
      orgData.forEach(row => {
        if (row.buckets && !row.buckets.is_deleted) {
          buckets.push(row.buckets);
        }
      });
    }
  } catch (err) {
    console.error('Error fetching org buckets for transfer:', err);
  }
  
  teamBucketsCache = buckets.sort((a, b) => a.name.localeCompare(b.name));
  return teamBucketsCache;
}`;

code = code.replace(targetLoad, replacementLoad);
fs.writeFileSync('src/pages/transfer.js', code, 'utf8');
