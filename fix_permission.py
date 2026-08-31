import re

with open('src/pages/buckets.js', 'r', encoding='utf-8') as f:
    content = f.read()

old = r"const isOrg = modalEl\?\.dataset\?\.isOrg === 'true';"
new = r"const isOrg = modalEl?.dataset?.isOrg === 'true';\n  const isGlobalFin = ['fih', 'fin', 'ceo', 'admin'].includes(String(state.user?.role || '').toLowerCase());"
content = re.sub(old, new, content)

old2 = r"if \(!isEdit && !state\.canCreateBuckets\) \{"
new2 = r"if (!isEdit && !state.canCreateBuckets && !(isOrg && isGlobalFin)) {"
content = re.sub(old2, new2, content)

with open('src/pages/buckets.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Permission fixed")
