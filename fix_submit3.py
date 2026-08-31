import re

with open('src/pages/buckets.js', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(r'<form id="bucketForm">', r'<form id="bucketForm" onsubmit="event.preventDefault(); window.saveBucket(event);">')

with open('src/pages/buckets.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("onsubmit re-added safely")
