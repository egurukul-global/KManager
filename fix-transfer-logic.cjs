const fs = require('fs');
let code = fs.readFileSync('src/pages/transfer.js', 'utf8');

// 1. Fix window.supabaseClient to supabaseClient
code = code.replace(/window\.supabaseClient/g, 'supabaseClient');

// 2. Fix Destination Bucket Visibility
// Right now loadTeamBuckets does:
// const { data: bAccess } = await supabaseClient.from('bucket_access').select('bucket_id, can_transfer, can_view_balance').eq('user_id', state.user.id).eq('can_transfer', true);
// We should remove .eq('can_transfer', true) and load all org buckets anyway.

const regexDest = /const \{ data: bAccess \} = await supabaseClient\s*\.from\('bucket_access'\)\s*\.select\('bucket_id, can_transfer, can_view_balance'\)\s*\.eq\('user_id', state\.user\.id\)\s*\.eq\('can_transfer', true\);\s*if \(bAccess && bAccess\.length > 0\) \{\s*const allowedBucketIds = bAccess\.map\(a => a\.bucket_id\);\s*orgResult = await supabaseClient\s*\.from\('buckets'\)\s*\.select\('\*'\)\s*\.eq\('is_org_level', true\)\s*\.eq\('is_deleted', false\)\s*\.in\('id', allowedBucketIds\);/;

const replDest = `const { data: bAccess } = await supabaseClient
      .from('bucket_access')
      .select('bucket_id, can_transfer, can_view_balance')
      .eq('user_id', state.user.id);
      
    // Fetch all org buckets so they can be selected as destinations
    orgResult = await supabaseClient
      .from('buckets')
      .select('*')
      .eq('is_org_level', true)
      .eq('is_deleted', false);`;

code = code.replace(regexDest, replDest);

// 3. Fix client-side balance check bypassing
// It was: if ((parseFloat(srcBucket.balance) || 0) < amount) {
const regexBal = /if \(\(parseFloat\(srcBucket\.balance\) \|\| 0\) < amount\) \{/;
const replBal = `if (srcBucket._can_view_balance !== false && (parseFloat(srcBucket.balance) || 0) < amount) {`;
code = code.replace(regexBal, replBal);

fs.writeFileSync('src/pages/transfer.js', code);
