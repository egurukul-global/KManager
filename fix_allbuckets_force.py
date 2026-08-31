with open('src/pages/buckets.js', 'r', encoding='utf-8') as f:
    content = f.read()

start_str = "if (error) throw error;"
start_idx = content.find(start_str, content.find("loadOrgBuckets"))

if start_idx != -1:
    new_str = "if (error) throw error;\n    allBuckets = data || [];"
    content = content[:start_idx] + new_str + content[start_idx + len(start_str):]
    with open('src/pages/buckets.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("allBuckets fixed!")
else:
    print("Not found")
