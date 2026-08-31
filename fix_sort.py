import re

with open('src/pages/buckets.js', 'r', encoding='utf-8') as f:
    content = f.read()

old = r"\(a\.name \|\| a\.email \|\| ''\)\.localeCompare\(\(b\.name \|\| b\.email \|\| ''\)\)"
new = r"String(a.name || a.email || '').localeCompare(String(b.name || b.email || ''))"
content = re.sub(old, new, content)

old2 = r"\(a\.name \|\| a\.email \|\| ''\)\.localeCompare\(b\.name \|\| b\.email \|\| ''\)"
new2 = r"String(a.name || a.email || '').localeCompare(String(b.name || b.email || ''))"
content = re.sub(old2, new2, content)

with open('src/pages/buckets.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Sort fixed")
