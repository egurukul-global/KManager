with open('src/state.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_block = """  if (role === 'admin' || isFinanceGlobalAdmin()) {
    state.canCreateBuckets = true;
    state.canEditBuckets = true;
    state.canDeleteBuckets = true;"""

new_block = """  if (role === 'admin' || isFinanceGlobalAdmin()) {
    state.canCreateBuckets = true;
    state.canEditBuckets = true;
    state.canDeleteBuckets = role === 'admin';"""

content = content.replace(old_block, new_block)

with open('src/state.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Removed delete from FIH")
