with open('src/utils/navPermissions.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_logic = """  const adminNav = document.getElementById('adminNav');
  if (adminNav) {
    const showAdmin = isSystemAdmin() || isOrgAdmin() || state.canManageTeamRoster;
    // User requested Admin menu to always be accessible if they have permissions
    adminNav.style.display = showAdmin ? '' : 'none';
  }"""

new_logic = """  const adminNav = document.getElementById('adminNav');
  if (adminNav) {
    const showAdmin = isSystemAdmin() || isOrgAdmin() || state.canManageTeamRoster;
    adminNav.style.display = (showAdmin && allowedViewSections.has('admin')) ? '' : 'none';
  }"""

content = content.replace(old_logic, new_logic)

with open('src/utils/navPermissions.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Admin nav visibility reverted")
