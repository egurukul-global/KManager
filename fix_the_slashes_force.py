with open('src/main.js', 'r', encoding='utf-8') as f:
    content = f.read()

import re
# Replace ALL \" with just " in the specific line
# Or just replace the exact substrings
content = content.replace('class=\\"nav-subitem\\"', 'class="nav-subitem"')
content = content.replace('data-page=\\"role-assignments\\"', 'data-page="role-assignments"')
content = content.replace('onclick=\\"window.showPage(\'role-assignments\')\\"', 'onclick="window.showPage(\'role-assignments\')"')

with open('src/main.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Slashes fixed for real")
