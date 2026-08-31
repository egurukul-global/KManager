with open('src/pages/buckets.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_users_btn = """${bucket.is_org_level && isFinanceGlobalAdmin() ? `<button type="button" class="btn-icon" onclick="window.openAssignUsersModal('${bucket.id}', '${safeName}')" title="Assign Users" aria-label="Assign Users" style="background: var(--accent-color); border: none; color: white; cursor: pointer; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 0.9em; margin-right: 8px;"><i class="fas fa-plus"></i></button>` : ''}"""

new_users_btn = """${bucket.is_org_level && isFinanceGlobalAdmin() ? `<button type="button" class="btn-icon" onclick="window.openAssignUsersModal('${bucket.id}', '${safeName}')" title="Assign Users" aria-label="Assign Users" style="background: #3b82f6; border: none; color: white; cursor: pointer; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 0.9em; margin-right: 8px;"><i class="fas fa-plus"></i></button>` : ''}"""

content = content.replace(old_users_btn, new_users_btn)

with open('src/pages/buckets.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Users button made explicitly blue")
