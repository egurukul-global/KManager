import re

with open('src/pages/buckets.js', 'r', encoding='utf-8') as f:
    content = f.read()

old = r"const isOrgBucket = modalEl\?\.dataset\?\.isOrg === 'true';"
new = r"const isOrgBucket = modalEl?.getAttribute('data-is-org') === 'true' || modalEl?.dataset?.isOrg === 'true';"
content = re.sub(old, new, content)

old_check = r"if \(!isEdit && !state\.canCreateBuckets && !\(isOrgBucket && isGlobalFin\)\) \{"
new_check = r"""console.log('DEBUG SAVE: isEdit=', isEdit, 'canCreate=', state.canCreateBuckets, 'isOrgBucket=', isOrgBucket, 'isGlobalFin=', isGlobalFin, 'role=', state.user?.role);
    if (!isEdit && !state.canCreateBuckets && !(isOrgBucket && isGlobalFin)) {"""
content = re.sub(old_check, new_check, content)

with open('src/pages/buckets.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Debug save injected")
