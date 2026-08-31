with open('src/utils/navPermissions.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_logic = """  const viewMode = state.activeViewContext || 'team';
  const allowedPages = VIEW_MENUS[viewMode]?.pages || [];
  
  if (!allowedPages.includes(pageName) && !['tasks', 'courses', 'konnect'].includes(pageName)) {
    return false;
  }"""

new_logic = """  const viewMode = state.activeViewContext || 'team';
  const allowedPages = new Set(VIEW_MENUS[viewMode]?.pages || []);
  const showAdmin = isSystemAdmin() || isOrgAdmin() || state.canManageTeamRoster;
  if (showAdmin) {
    VIEW_MENUS.admin.pages.forEach(p => allowedPages.add(p));
  }
  
  if (!allowedPages.has(pageName) && !['tasks', 'courses', 'konnect'].includes(pageName)) {
    return false;
  }"""

content = content.replace(old_logic, new_logic)

with open('src/utils/navPermissions.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("canAccessPage updated")
