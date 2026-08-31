import re

with open('src/pages/buckets.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_save = r"await loadOrgBuckets\(\);\s*document\.getElementById\('assignUsersModal'\)\.classList\.remove\('active'\);\s*showToast\('Bucket access saved', 'success'\);"
new_save = r"""await loadOrgBuckets();
    if (user) user.is_assigned = true;
    window.renderAssignedUsers();
    document.getElementById('assignUserAccessBox').style.display = 'none';
    document.getElementById('assignUserSelect').value = '';
    showToast('User assigned', 'success');"""
content = re.sub(old_save, new_save, content)

with open('src/pages/buckets.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("saveBucketAccess fixed")
