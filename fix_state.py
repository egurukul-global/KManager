with open('src/state.js', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("import { hasAnyGlobalFinanceRole } from './utils/appRoles.js';", "import { hasAnyGlobalFinanceRole, isFinanceGlobalAdmin } from './utils/appRoles.js';")

old_admin_block = """  if (role === 'admin') {
    state.canCreateBuckets = true;
    state.canEditBuckets = true;
    state.canDeleteBuckets = true;
    state.canCreateCategories = true;
    state.canEditCategories = true;
    state.canDeleteCategories = true;
    state.canCreateBudgets = true;"""

new_admin_block = """  if (role === 'admin' || isFinanceGlobalAdmin()) {
    state.canCreateBuckets = true;
    state.canEditBuckets = true;
    state.canDeleteBuckets = true;
    state.canCreateCategories = true;
    state.canEditCategories = true;
    state.canDeleteCategories = true;
    state.canCreateBudgets = true;"""

content = content.replace(old_admin_block, new_admin_block)

with open('src/state.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("state.js fixed")
