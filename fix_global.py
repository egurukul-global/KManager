import re

with open('src/pages/buckets.js', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("window.filterAssignUsers(", "window.filterBucketAssignUsers(")
content = content.replace("window.filterAssignUsers = ", "window.filterBucketAssignUsers = ")

with open('src/pages/buckets.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("filterAssignUsers renamed")
