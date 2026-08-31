with open('src/pages/buckets.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_block = """      if (error) throw error;
      
      const list = document.getElementById('orgBucketsList');"""

new_block = """      if (error) throw error;
      allBuckets = data || [];
      const list = document.getElementById('orgBucketsList');"""

content = content.replace(old_block, new_block)

with open('src/pages/buckets.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("allBuckets assigned in loadOrgBuckets")
