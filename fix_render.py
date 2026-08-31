import re

with open('src/pages/buckets.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_func = r"window\.renderSelectedUserAccess = function\(\) \{.*?box\.style\.display = 'block';\n  \};"

new_func = r"""window.renderSelectedUserAccess = function() {
  const userId = document.getElementById('assignUserSelect')?.value;
  const box = document.getElementById('assignUserAccessBox');
  if (!userId || !box) return;

  const user = allAssignUsers.find(u => u.id === userId);
  if (!user) {
    box.style.display = 'none';
    const removeBtn = document.getElementById('btnRemoveAccess');
    if (removeBtn) removeBtn.style.display = 'none';
    return;
  }

  document.getElementById('assignCanViewBalance').checked = !!user.can_view_balance;
  document.getElementById('assignCanTransfer').checked = !!user.can_transfer;
  box.style.display = 'block';

  const removeBtn = document.getElementById('btnRemoveAccess');
  if (removeBtn) {
    removeBtn.style.display = user.is_assigned ? 'inline-block' : 'none';
  }
};"""

content = re.sub(old_func, new_func, content, flags=re.DOTALL)

with open('src/pages/buckets.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Render selected access fixed")
