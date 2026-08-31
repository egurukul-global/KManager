with open('src/main.js', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('<div class="nav-subitem" data-page="role-assignments" onclick="window.showPage(\'role-assignments\')">Users</div>', '<div class="nav-subitem" data-page="role-assignments" onclick="window.showPage(\'role-assignments\')">Role Assignments</div>')

with open('src/main.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Name reverted")
