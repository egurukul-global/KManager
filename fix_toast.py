import re

with open('src/components/toasts.js', 'r', encoding='utf-8') as f:
    content = f.read()

old = r"modal\.className = 'modal active alert-modal';"
new = r"modal.className = 'modal active alert-modal';\n  modal.style.zIndex = '10000';"
content = re.sub(old, new, content)

with open('src/components/toasts.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Toast fixed")
