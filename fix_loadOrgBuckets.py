import re

with open('src/pages/buckets.js', 'r', encoding='utf-8') as f:
    content = f.read()

old = r"const \{ data: accessData \} = await supabaseClient\n        \.from\('bucket_access'\)\n        \.select\('bucket_id, users\(name, email, role\)'\);\n        \n      const accessMap = \{\};\n      if \(accessData\) \{\n        accessData\.forEach\(row => \{\n          if \(!accessMap\[row\.bucket_id\]\) accessMap\[row\.bucket_id\] = \[\];\n          accessMap\[row\.bucket_id\]\.push\(row\.users\);\n        \}\);\n      \}"
new = r"const { data: accessData } = await supabaseClient\n        .from('bucket_access')\n        .select('bucket_id, user_id');\n      const userIds = [...new Set((accessData || []).map(r => r.user_id))];\n      let usersMap = {};\n      if (userIds.length > 0) {\n        const { data: usersData } = await supabaseClient.from('users').select('id, name, email').in('id', userIds);\n        if (usersData) {\n          usersData.forEach(u => usersMap[u.id] = u);\n        }\n      }\n      const accessMap = {};\n      if (accessData) {\n        accessData.forEach(row => {\n          if (!accessMap[row.bucket_id]) accessMap[row.bucket_id] = [];\n          if (usersMap[row.user_id]) accessMap[row.bucket_id].push(usersMap[row.user_id]);\n        });\n      }"
content = re.sub(old, new, content)

with open('src/pages/buckets.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("loadOrgBuckets fixed")
