import re

with open('src/pages/buckets.js', 'r', encoding='utf-8') as f:
    content = f.read()

content = "console.log('=== BUCKETS.JS NEWEST VERSION LOADED ===');\n" + content

with open('src/pages/buckets.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Log injected")
