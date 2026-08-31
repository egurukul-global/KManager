import os

# 1. Update navPermissions.js
with open('src/utils/navPermissions.js', 'r', encoding='utf-8') as f:
    content = f.read()

import_statement = "import { hasMenuAccess } from './okAccess.js';\nimport { isFinanceGlobalAdmin } from './appRoles.js';"
content = content.replace("import { hasMenuAccess } from './okAccess.js';", import_statement)

old_org_admin = """function isOrgAdmin() {
  return ['admin', 'caoh', 'oh', 'ceo', 'fih'].includes(state.user?.role);
}"""
new_org_admin = """function isOrgAdmin() {
  const role = String(state.user?.role || '').toLowerCase();
  return ['admin', 'caoh', 'oh', 'ceo', 'fih'].includes(role) || isFinanceGlobalAdmin();
}"""
content = content.replace(old_org_admin, new_org_admin)

old_role_assign = """if (page === 'role-assignments') {
      const role = String(state.user?.role || 'user').toLowerCase();
      if (!['admin', 'oh', 'caoh', 'fih'].includes(role)) hide = true;
    }"""
new_role_assign = """if (page === 'role-assignments') {
      const role = String(state.user?.role || 'user').toLowerCase();
      if (!['admin', 'oh', 'caoh', 'fih'].includes(role) && !isFinanceGlobalAdmin()) hide = true;
    }"""
content = content.replace(old_role_assign, new_role_assign)

with open('src/utils/navPermissions.js', 'w', encoding='utf-8') as f:
    f.write(content)

# 2. Update approvalAccess.js
with open('src/utils/approvalAccess.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Make sure isFinanceGlobalAdmin is imported. Is it?
import_check = "isFinanceGlobalAdmin" in content
if not import_check:
    import_appRoles = "import { isFinanceGlobalAdmin } from './appRoles.js';"
    # Insert after import { state } from '../state.js';
    content = content.replace("import { state } from '../state.js';", "import { state } from '../state.js';\n" + import_appRoles)

old_can_manage = """export function canManageRoleAssignments() {
  const role = String(state.user?.role || 'user').toLowerCase();
  return ['admin', 'oh', 'caoh'].includes(role);
}"""
new_can_manage = """export function canManageRoleAssignments() {
  const role = String(state.user?.role || 'user').toLowerCase();
  return ['admin', 'oh', 'caoh', 'fih'].includes(role) || isFinanceGlobalAdmin();
}"""
content = content.replace(old_can_manage, new_can_manage)

with open('src/utils/approvalAccess.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Role logic updated to support appRoleAssignments")
