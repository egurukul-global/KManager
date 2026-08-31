import re

with open('src/pages/buckets.js', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("!(isOrg && isGlobalFin)", "!(isOrgBucket && isGlobalFin)")
content = content.replace("const isOrg = modalEl?.dataset?.isOrg === 'true';\n  const isGlobalFin", "const isGlobalFin")

with open('src/pages/buckets.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("isOrg fixed")
