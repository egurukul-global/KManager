with open('src/main.js', 'r', encoding='utf-8') as f:
    content = f.read()

bad_html = r'<div class=\"nav-subitem\" data-page=\"role-assignments\" onclick=\"window.showPage(\'role-assignments\')\">Users</div>'
good_html = '<div class="nav-subitem" data-page="role-assignments" onclick="window.showPage(\'role-assignments\')">Users</div>'

content = content.replace(bad_html, good_html)

with open('src/main.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("HTML backslashes fixed")
