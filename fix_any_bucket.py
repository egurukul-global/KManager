import re

with open('src/pages/buckets.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_check = r"if \(!isEdit && !state\.canCreateBuckets && !\(isOrgBucket && isGlobalFin\)\) \{"
new_check = r"if (!isEdit && !state.canCreateBuckets && !isGlobalFin) {"
content = re.sub(old_check, new_check, content)

with open('src/pages/buckets.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Any bucket allowed for global fin")
