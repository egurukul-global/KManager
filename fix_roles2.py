with open('src/pages/buckets.js', 'r', encoding='utf-8') as f:
    content = f.read()

old = """  const isGlobalFin = ['fih', 'fin', 'ceo', 'admin'].includes(String(state.user?.role || '').toLowerCase());

  if (isEdit && !state.canEditBuckets) {
    showToast('You do not have permission to edit buckets', 'error');
    return;
  }
  console.log('DEBUG SAVE: isEdit=', isEdit, 'canCreate=', state.canCreateBuckets, 'isOrgBucket=', isOrgBucket, 'isGlobalFin=', isGlobalFin, 'role=', state.user?.role);
    if (!isEdit && !state.canCreateBuckets && !isGlobalFin) {"""

new = """  const isGlobalAdmin = ['admin', 'ceo', 'caoh', 'oh', 'fih'].includes(String(state.user?.role || '').toLowerCase());

  if (isEdit && !state.canEditBuckets) {
    showToast('You do not have permission to edit buckets', 'error');
    return;
  }
  if (!isEdit && !state.canCreateBuckets && !isGlobalAdmin) {"""

content = content.replace(old, new)

with open('src/pages/buckets.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Replaced")
