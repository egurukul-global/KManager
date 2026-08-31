with open('src/pages/buckets.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Remove the bad line
bad_line = "    allBuckets = data || [];\n"
content = content.replace(bad_line, "")

# 2. Put it in loadOrgBuckets
start_str = "async function loadOrgBuckets() {"
start_idx = content.find(start_str)
if start_idx != -1:
    error_str = "if (error) throw error;"
    error_idx = content.find(error_str, start_idx)
    if error_idx != -1:
        new_str = "if (error) throw error;\n      allBuckets = data || [];"
        content = content[:error_idx] + new_str + content[error_idx + len(error_str):]
        with open('src/pages/buckets.js', 'w', encoding='utf-8') as f:
            f.write(content)
        print("allBuckets fixed in the correct function!")
    else:
        print("error_str not found")
else:
    print("start_str not found")
