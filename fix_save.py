import re

with open('src/pages/buckets.js', 'r', encoding='utf-8') as f:
    content = f.read()

if "window.saveBucket = saveBucket;" not in content:
    content += "\nwindow.saveBucket = saveBucket;\n"

with open('src/pages/buckets.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("saveBucket attached to window")
