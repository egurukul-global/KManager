import sys

file_path = r'C:\Users\dell\Documents\GitHub\KManager-test\src\pages\expense-reports.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Fix the import and await of loadCategoryMaster in expense-reports.js
old_init = """    teamAttachments = (attachmentsRes.data || []).filter(a => !a.is_deleted);

    import('../utils/categoryMaster.js').then(m => m.loadCategoryMaster()).then(cats => {
      teamCategories = cats || [];
    }).catch(console.error);

    populateReportFilters();"""

new_init = """    teamAttachments = (attachmentsRes.data || []).filter(a => !a.is_deleted);

    try {
      const catModule = await import('../utils/categoryMaster.js');
      teamCategories = await catModule.loadCategoryMaster() || [];
    } catch (e) {
      console.error(e);
      teamCategories = [];
    }

    populateReportFilters();"""

content = content.replace(old_init, new_init)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("expense-reports.js category loading fixed")
