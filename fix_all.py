import re

with open('src/pages/buckets.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix isGlobalFin
content = re.sub(
    r"const isOrgBucket = modalEl\?\.dataset\?\.isOrg === 'true';",
    r"const isOrgBucket = modalEl?.dataset?.isOrg === 'true';\n  const isGlobalFin = ['fih', 'fin', 'ceo', 'admin'].includes(String(state.user?.role || '').toLowerCase());",
    content
)

# Fix loadOrgBuckets (just replace the entire fetch part)
old_block = r"const \{ data: accessData \} = await supabaseClient\n\s*\.from\('bucket_access'\)\n\s*\.select\('bucket_id, users\(name, email, role\)'\);\n\s*const accessMap = \{\};\n\s*if \(accessData\) \{\n\s*accessData\.forEach\(row => \{\n\s*if \(!accessMap\[row\.bucket_id\]\) accessMap\[row\.bucket_id\] = \[\];\n\s*accessMap\[row\.bucket_id\]\.push\(row\.users\);\n\s*\}\);\n\s*\}"

new_block = r"""const { data: accessData } = await supabaseClient
      .from('bucket_access')
      .select('bucket_id, user_id');
      
    const userIds = [...new Set((accessData || []).map(r => r.user_id))];
    let usersMap = {};
    if (userIds.length > 0) {
      const { data: usersData } = await supabaseClient.from('users').select('id, name, email').in('id', userIds);
      if (usersData) {
        usersData.forEach(u => usersMap[u.id] = u);
      }
    }
    
    const accessMap = {};
    if (accessData) {
      accessData.forEach(row => {
        if (!accessMap[row.bucket_id]) accessMap[row.bucket_id] = [];
        if (usersMap[row.user_id]) accessMap[row.bucket_id].push(usersMap[row.user_id]);
      });
    }"""

content = re.sub(old_block, new_block, content)

# Fix the debug text back to normal
content = re.sub(
    r": `No users assigned \(debug: access=\$\{accessData\?\.length\}, users=\$\{Object\.keys\(usersMap\)\.length\}\)`;",
    r": 'No users assigned';",
    content
)

with open('src/pages/buckets.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Fixed everything")
