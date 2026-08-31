import re

with open('src/pages/buckets.js', 'r', encoding='utf-8') as f:
    content = f.read()

old = r": 'No users assigned';"
new = r": `No users assigned (debug: access=${accessData?.length}, users=${Object.keys(usersMap).length})`;"
content = re.sub(old, new, content)

with open('src/pages/buckets.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Debug text injected")
