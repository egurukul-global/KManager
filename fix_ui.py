import re

with open('src/pages/buckets.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update renderBucketGrid
old_grid = r"function renderBucketGrid\(buckets\) \{"
new_grid = r"function renderBucketGrid(buckets, accessMap = null) {"
content = re.sub(old_grid, new_grid, content)

old_card_top = r"(\$\{canEdit \? btnIconEdit\(`window\.loadBucketForEdit\('\$\{bucket\.id\}'\)`\) : ''\})"
new_card_top = r"\1\n              ${bucket.is_org_level && state.canCreateBuckets ? `<button type=\"button\" class=\"btn-icon\" onclick=\"window.openAssignUsersModal('${bucket.id}', '${safeName}')\" title=\"Assign Users\" aria-label=\"Assign Users\" style=\"background: none; border: none; color: var(--accent-color); cursor: pointer; padding: 4px;\">Users</button>` : ''}"
content = re.sub(old_card_top, new_card_top, content)

old_card_row = r"(\$\{display\.usdLine \? cardRow\('USD equiv\.', display\.usdLine\) : ''\})"
new_card_row = r"\1\n          ${bucket.is_org_level && accessMap ? cardRow('Assigned Users', accessMap[bucket.id] && accessMap[bucket.id].length > 0 ? accessMap[bucket.id].map(u => u.name || u.email).join(', ') : 'No users assigned') : ''}"
content = re.sub(old_card_row, new_card_row, content)

# 2. Update loadOrgBuckets
old_loop = r"list\.innerHTML = data\.map\(b => \{.*?\}\)\.join\(''\);"
new_loop = r"list.innerHTML = renderBucketGrid(data, accessMap);"
content = re.sub(old_loop, new_loop, content, flags=re.DOTALL)

# 3. Add Remove Access button in HTML
old_modal_buttons = r"<button type=\"button\" class=\"sq-btn primary\" onclick=\"window\.saveBucketAccess\(\)\">Save access</button>"
new_modal_buttons = r"""<button type="button" class="sq-btn danger" id="btnRemoveAccess" onclick="window.removeBucketAccess()" style="display: none; background: #e53e3e; border: none; color: white;">Remove</button>
            <button type="button" class="sq-btn primary" onclick="window.saveBucketAccess()">Save access</button>"""
content = re.sub(old_modal_buttons, new_modal_buttons, content)

# 4. Update loadAssignableUsersForBucket to track is_assigned
old_map = r"can_transfer: !!\(accessMap\.get\(u\.id\)\?\.can_transfer \?\? false\),"
new_map = r"is_assigned: accessMap.has(u.id),\n          can_transfer: !!(accessMap.get(u.id)?.can_transfer ?? false),"
content = re.sub(old_map, new_map, content)

# 5. Update renderSelectedUserAccess to show/hide Remove button
old_render = r"document\.getElementById\('assignCanTransfer'\)\.checked = !!user\.can_transfer;\n    box\.style\.display = 'block';"
new_render = r"""document.getElementById('assignCanTransfer').checked = !!user.can_transfer;
    box.style.display = 'block';
    
    const removeBtn = document.getElementById('btnRemoveAccess');
    if (removeBtn) {
      removeBtn.style.display = user.is_assigned ? 'inline-block' : 'none';
    }"""
content = re.sub(old_render, new_render, content)

# 6. Add window.removeBucketAccess function
remove_func = r"""
  window.removeBucketAccess = async function() {
    if (!currentAssignBucket) return;
    const userId = document.getElementById('assignUserSelect')?.value;
    if (!userId) return;

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
      document.getElementById('assignUsersModal').classList.remove('active');
      showToast('User access removed', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to remove access.', 'error');
    }
  };
"""

content = content.replace("window.saveBucketAccess = async function() {", remove_func + "\n  window.saveBucketAccess = async function() {")

with open('src/pages/buckets.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("UI updated successfully")
