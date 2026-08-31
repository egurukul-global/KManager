import re

with open('src/pages/buckets.js', 'r', encoding='utf-8') as f:
    content = f.read()

content += "\nwindow.saveBucket = saveBucket;\n"

with open('src/pages/buckets.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("saveBucket FORCED to window")
