import re

with open('src/pages/buckets.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_btn = r"<button type=\"submit\">"
new_btn = r"<button type=\"button\" onclick=\"window.saveBucket(event)\">"
content = re.sub(old_btn, new_btn, content)

with open('src/pages/buckets.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Button changed to type=button")
