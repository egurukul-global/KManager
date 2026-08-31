with open('src/pages/buckets.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_func = """window.removeRowAccess = async function(userId) {
  if (!currentAssignBucket || !userId) return;
  try {
    const { error } = await supabaseClient.from('bucket_access').delete().eq('bucket_id', currentAssignBucket).eq('user_id', userId);
    if (error) throw error;
    
    const user = allAssignUsers.find(u => u.id === userId);
    if (user) {
      user.is_assigned = false;
      user.can_transfer = false;
      user.can_view_balance = false;
    }
    await loadOrgBuckets();
    window.renderAssignedUsers();
    showToast('User removed', 'success');
  } catch (err) {
    console.error(err);
    showToast('Failed to remove user.', 'error');
  }
};"""

new_func = """window.removeRowAccess = async function(userId) {
  if (!currentAssignBucket || !userId) return;
  const user = allAssignUsers.find(u => u.id === userId);
  const name = user ? (user.name || user.email) : 'this user';
  
  showConfirm(`Are you sure you want to remove access for <b>${name}</b>?`, async () => {
    try {
      const { error } = await supabaseClient.from('bucket_access').delete().eq('bucket_id', currentAssignBucket).eq('user_id', userId);
      if (error) throw error;
      
      if (user) {
        user.is_assigned = false;
        user.can_transfer = false;
        user.can_view_balance = false;
      }
      await loadOrgBuckets();
      window.renderAssignedUsers();
      showToast('User removed successfully', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to remove user.', 'error');
    }
  });
};"""

content = content.replace(old_func, new_func)

with open('src/pages/buckets.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Added showConfirm")
