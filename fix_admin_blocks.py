with open('src/utils/navPermissions.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_block = """    document.querySelectorAll('.nav-subitem[data-page], .nav-subitem-label[data-page]').forEach(el => {
      const page = el.dataset.page;
      let hide = false;
      
      if (!allowedViewPages.has(page)) hide = true;

      if (otm && OTM_HIDDEN_PAGES.has(page)) hide = true;"""

new_block = """    document.querySelectorAll('.nav-subitem[data-page], .nav-subitem-label[data-page]').forEach(el => {
      const page = el.dataset.page;
      let hide = false;
      
      if (!allowedViewPages.has(page)) hide = true;

      // Do not apply team-level access blocks to admin pages
      const isAdminPage = VIEW_MENUS.admin.pages.includes(page);
      
      if (!isAdminPage && otm && OTM_HIDDEN_PAGES.has(page)) hide = true;"""

content = content.replace(old_block, new_block)

old_block2 = """      if (otm && !OTM_ALLOWED_PAGES.has(page)) {
        const r = String(state.user?.role || '').toLowerCase();
        const isFin = ['admin', 'caoh', 'oh', 'ceo', 'fin', 'fip', 'fih'].includes(r);
        if ((page === 'manager-finance' || page === 'transfer' || page === 'manager-expenses') && isFin) { /* let it show */ } else { hide = true; }
      }
      if (viewOnly && !VIEW_ALLOWED_PAGES.has(page)) {
        const r = String(state.user?.role || '').toLowerCase();
        const isFin = ['admin', 'caoh', 'oh', 'ceo', 'fin', 'fip', 'fih'].includes(r);
        if ((page === 'manager-finance' || page === 'transfer' || page === 'manager-expenses') && isFin) { /* let it show */ } else { hide = true; }
      }
      if (oht && OHT_HIDDEN_PAGES.has(page)) hide = true;"""

new_block2 = """      if (!isAdminPage && otm && !OTM_ALLOWED_PAGES.has(page)) {
        const r = String(state.user?.role || '').toLowerCase();
        const isFin = ['admin', 'caoh', 'oh', 'ceo', 'fin', 'fip', 'fih'].includes(r);
        if ((page === 'manager-finance' || page === 'transfer' || page === 'manager-expenses') && isFin) { /* let it show */ } else { hide = true; }
      }
      if (!isAdminPage && viewOnly && !VIEW_ALLOWED_PAGES.has(page)) {
        const r = String(state.user?.role || '').toLowerCase();
        const isFin = ['admin', 'caoh', 'oh', 'ceo', 'fin', 'fip', 'fih'].includes(r);
        if ((page === 'manager-finance' || page === 'transfer' || page === 'manager-expenses') && isFin) { /* let it show */ } else { hide = true; }
      }
      if (!isAdminPage && oht && OHT_HIDDEN_PAGES.has(page)) hide = true;"""

content = content.replace(old_block2, new_block2)

with open('src/utils/navPermissions.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Admin blocks bypassed")
