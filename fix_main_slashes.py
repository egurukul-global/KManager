with open('src/main.js', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(r'class=\"nav-subitem\" data-page=\"role-assignments\" onclick=\"window.showPage(\'role-assignments\')\"', 'class="nav-subitem" data-page="role-assignments" onclick="window.showPage(\'role-assignments\')"')

with open('src/main.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Slashes fixed")
