import sys

file_path = r'C:\Users\dell\Documents\GitHub\KManager-test\src\pages\expense-reports.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# I noticed a weird character "?" injected during replacement because of unicode.
# Let's just fix the fallback for rName explicitly.
content = content.replace("log._rName || '?\"'", "log._rName || '-'")
content = content.replace("log._rName || '?-'", "log._rName || '-'")

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
