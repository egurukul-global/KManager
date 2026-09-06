import sys

file_path = r'C:\Users\dell\Documents\GitHub\KManager-test\src\pages\expense-reports.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace sbSelect('categories'...)
old_select = "sbSelect('categories', { teamId, orderBy: 'name', ascending: true }),"
content = content.replace(old_select, "")

# Replace teamCategories assignment
old_assign = "teamCategories = (categoriesRes.data || []).filter(c => !c.is_deleted);"
new_assign = """
    try {
      const catModule = await import('../utils/categoryMaster.js');
      teamCategories = await catModule.loadCategoryMaster() || [];
    } catch (e) {
      console.error(e);
      teamCategories = [];
    }
"""
content = content.replace(old_assign, new_assign)

# In Promise.all, remove categoriesRes
old_promise = "const [bucketsRes, budgetsRes, categoriesRes, expensesRes, incomeRes, attachmentsRes] = await Promise.all(["
new_promise = "const [bucketsRes, budgetsRes, expensesRes, incomeRes, attachmentsRes] = await Promise.all(["
content = content.replace(old_promise, new_promise)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("expense-reports.js categories load fixed!")
