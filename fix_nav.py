with open('src/utils/navPermissions.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_admin_nav = """  const adminNav = document.getElementById('adminNav');
  if (adminNav) {
    const showAdmin = isSystemAdmin() || isOrgAdmin() || state.canManageTeamRoster;
    // Context-Based View Architecture: Only show Admin nav if they are in 'admin' mode
    adminNav.style.display = (showAdmin && allowedViewSections.has('admin')) ? '' : 'none';
  }"""

new_admin_nav = """  const adminNav = document.getElementById('adminNav');
  if (adminNav) {
    const showAdmin = isSystemAdmin() || isOrgAdmin() || state.canManageTeamRoster;
    // User requested Admin menu to always be accessible if they have permissions
    adminNav.style.display = showAdmin ? '' : 'none';
  }"""

content = content.replace(old_admin_nav, new_admin_nav)

with open('src/utils/navPermissions.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Nav fixed")
