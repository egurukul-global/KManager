import re

with open('src/pages/buckets.js', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(r'<form id="bucketForm" onsubmit="window.saveBucket(event)">', r'<form id="bucketForm">')

old = r"createModal\(modalId, content\);\n    openModal\(modalId\);\n\n    if \(isEdit\) \{"
new = r"createModal(modalId, content);\n    openModal(modalId);\n    document.getElementById('bucketForm').addEventListener('submit', saveBucket);\n\n    if (isEdit) {"
content = re.sub(old, new, content)

with open('src/pages/buckets.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Submit event listener attached")
