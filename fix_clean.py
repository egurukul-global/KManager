import re

with open('src/pages/buckets.js', 'r', encoding='utf-8') as f:
    content = f.read()

content = re.sub(r"const s = document\.getElementById\('assignUserSelect'\);\n\s*if \(s\) s\.innerHTML = '<option value=\"\">Step 1: start</option>';", "", content)
content = re.sub(r"if \(s\) s\.innerHTML = '<option value=\"\">Step 2: querying users</option>';", "", content)
content = re.sub(r"if \(s\) s\.innerHTML = '<option value=\"\">Step 3: users done</option>';", "", content)
content = re.sub(r"if \(s\) s\.innerHTML = '<option value=\"\">Step 4: querying bucket_access</option>';", "", content)
content = re.sub(r"if \(s\) s\.innerHTML = '<option value=\"\">Step 5: mapping access</option>';", "", content)
content = re.sub(r"if \(s\) s\.innerHTML = '<option value=\"\">Step 6: array mapped</option>';", "", content)
content = re.sub(r"if \(s\) s\.innerHTML = '<option value=\"\">Step 7: finished loadAssignableUsers</option>';", "", content)

content = re.sub(r"if \(select\) select\.innerHTML = '<option value=\"\">Step 8: calling filter</option>';", "", content)
content = re.sub(r"if \(select && select\.innerHTML\.includes\('Step 8'\)\) select\.innerHTML = '<option value=\"\">Step 9: filter finished</option>';", "", content)

content = re.sub(r"setTimeout\(\(\) => \{ if\(select\.innerHTML\.includes\('Wait'\)\).*?\n", "", content)
content = content.replace("Loading users... (Wait)", "Loading users...")

with open('src/pages/buckets.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Steps cleaned")
