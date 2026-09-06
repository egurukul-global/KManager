import sys
import re

file_path = r'C:\Users\dell\Documents\GitHub\KManager-test\src\pages\expense-reports.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

content = re.sub(r"log\._rName \|\| '[^']*'", "log._rName || '-'", content)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
