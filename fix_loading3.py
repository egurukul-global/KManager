import re

with open('src/pages/buckets.js', 'r', encoding='utf-8') as f:
    content = f.read()

old = r"can_view_balance: !!\(accessMap\.get\(u\.id\)\?\.can_view_balance \?\? false\)\n        \}\)\);"
new = r"can_view_balance: !!(accessMap.get(u.id)?.can_view_balance ?? false)\n        }));\n      if (s) s.innerHTML = '<option value=\"\">Step 6: array mapped</option>';"
content = re.sub(old, new, content)

old2 = r"if \(!allAssignUsers\.length && directLookupError\) \{"
new2 = r"if (s) s.innerHTML = '<option value=\"\">Step 7: finished loadAssignableUsers</option>';\n      if (!allAssignUsers.length && directLookupError) {"
content = re.sub(old2, new2, content)

old3 = r"window\.filterAssignUsers\(\);"
new3 = r"if (select) select.innerHTML = '<option value=\"\">Step 8: calling filter</option>';\n      window.filterAssignUsers();\n      if (select && select.innerHTML.includes('Step 8')) select.innerHTML = '<option value=\"\">Step 9: filter finished</option>';"
content = re.sub(old3, new3, content)

with open('src/pages/buckets.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("More steps injected")
