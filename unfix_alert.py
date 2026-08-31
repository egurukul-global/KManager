import re

with open('src/pages/buckets.js', 'r', encoding='utf-8') as f:
    content = f.read()

old = r"window\.onerror = function\(m, s, l, c, e\) \{ alert\(m\); \};\n  window\.addEventListener\('unhandledrejection', function\(e\) \{ alert\(e\.reason\); \}\);"
new = r""
content = re.sub(old, new, content)

with open('src/pages/buckets.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Alerts removed")
