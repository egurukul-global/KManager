import re

with open('src/main.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_nav = r"<div class=\"nav-subitem\" data-page=\"role-assignments\" onclick=\"window\.showPage\('role-assignments'\)\">Role Assignments</div>"
new_nav = r"<div class=\"nav-subitem\" data-page=\"role-assignments\" onclick=\"window.showPage('role-assignments')\">Users</div>"

content = re.sub(old_nav, new_nav, content)

with open('src/main.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Sidebar updated")
