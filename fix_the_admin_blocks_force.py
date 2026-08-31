with open('src/utils/navPermissions.js', 'r', encoding='utf-8') as f:
    content = f.read()

# I will inject `const isAdminPage = VIEW_MENUS.admin.pages.includes(page);`
content = content.replace('let hide = false;', 'let hide = false;\n      const isAdminPage = VIEW_MENUS.admin.pages.includes(page);')

# Now replace the otm/viewOnly/oht blocks
content = content.replace('if (otm && OTM_HIDDEN_PAGES.has(page)) hide = true;', 'if (!isAdminPage && otm && OTM_HIDDEN_PAGES.has(page)) hide = true;')
content = content.replace('if (otm && !OTM_ALLOWED_PAGES.has(page)) {', 'if (!isAdminPage && otm && !OTM_ALLOWED_PAGES.has(page)) {')
content = content.replace('if (viewOnly && !VIEW_ALLOWED_PAGES.has(page)) {', 'if (!isAdminPage && viewOnly && !VIEW_ALLOWED_PAGES.has(page)) {')
content = content.replace('if (oht && OHT_HIDDEN_PAGES.has(page)) hide = true;', 'if (!isAdminPage && oht && OHT_HIDDEN_PAGES.has(page)) hide = true;')

with open('src/utils/navPermissions.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Force fixed")
