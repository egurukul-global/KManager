import re

with open('src/pages/buckets.js', 'r', encoding='utf-8') as f:
    content = f.read()

old = r"\$\{bucket\.is_org_level && state\.canCreateBuckets \?"
new = r"${bucket.is_org_level && ['admin', 'ceo', 'caoh', 'oh', 'fih'].includes(String(state.user?.role || '').toLowerCase()) ?"
content = re.sub(old, new, content)

with open('src/pages/buckets.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Grid permission fixed")
