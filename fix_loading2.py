import re

with open('src/pages/buckets.js', 'r', encoding='utf-8') as f:
    content = f.read()

old = r"async function loadAssignableUsersForBucket\(bucketId\) \{"
new = r"async function loadAssignableUsersForBucket(bucketId) {\n  const s = document.getElementById('assignUserSelect');\n  if (s) s.innerHTML = '<option value=\"\">Step 1: start</option>';"
content = re.sub(old, new, content)

old2 = r"const \{ data, error \} = await supabaseClient\n        \.from\('users'\)\n        \.select\('id, name, email, role'\)\n        \.order\('name'\);"
new2 = r"if (s) s.innerHTML = '<option value=\"\">Step 2: querying users</option>';\n      const { data, error } = await supabaseClient\n        .from('users')\n        .select('id, name, email, role')\n        .order('name');\n      if (s) s.innerHTML = '<option value=\"\">Step 3: users done</option>';"
content = re.sub(old2, new2, content)

old3 = r"const \{ data: accessData \} = await supabaseClient\n        \.from\('bucket_access'\)"
new3 = r"if (s) s.innerHTML = '<option value=\"\">Step 4: querying bucket_access</option>';\n      const { data: accessData } = await supabaseClient\n        .from('bucket_access')"
content = re.sub(old3, new3, content)

old4 = r"const accessMap = new Map"
new4 = r"if (s) s.innerHTML = '<option value=\"\">Step 5: mapping access</option>';\n      const accessMap = new Map"
content = re.sub(old4, new4, content)

with open('src/pages/buckets.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Steps injected")
