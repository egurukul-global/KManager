with open('src/utils/navPermissions.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_logic = """  const viewMode = state.activeViewContext || 'team';
  const allowedViewPages = new Set(VIEW_MENUS[viewMode]?.pages || []);
  const allowedViewSections = new Set(VIEW_MENUS[viewMode]?.sections || []);
  
  // User requested Admin pages to always be available if they have permissions, regardless of current view mode
  const showAdmin = isSystemAdmin() || isOrgAdmin() || state.canManageTeamRoster;
  if (showAdmin) {
    VIEW_MENUS.admin.pages.forEach(p => allowedViewPages.add(p));
  }"""

new_logic = """  const viewMode = state.activeViewContext || 'team';
  const allowedViewPages = new Set(VIEW_MENUS[viewMode]?.pages || []);
  const allowedViewSections = new Set(VIEW_MENUS[viewMode]?.sections || []);"""

content = content.replace(old_logic, new_logic)

with open('src/utils/navPermissions.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Admin isolation reverted")
