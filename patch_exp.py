import sys

file_path = r'C:\Users\dell\Documents\GitHub\KManager-test\src\pages\expenses.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update HTML
old_html = """          <div class="form-grid-row form-grid-row--filter-main">
            <div class="form-group"><label>Budget</label><select id="expFilterBudget" onchange="window.onExpenseBudgetFilterChange()"><option value="">All</option></select></div>
            <div class="form-group"><label>Category</label><select id="expFilterCategory" onchange="window.refreshExpenseList()"><option value="">All</option></select></div>
            <div class="form-group"><label>Bucket</label><select id="expFilterBucket" onchange="window.refreshExpenseList()"><option value="">All</option></select></div>
          </div>"""

new_html = """          <div class="form-grid-row form-grid-row--filter-main" style="grid-template-columns: repeat(4, 1fr); width: 100%;">
            <div class="form-group"><label>Budget</label><select id="expFilterBudget" onchange="window.onExpenseBudgetFilterChange()"><option value="">All</option></select></div>
            <div class="form-group"><label>Category</label><select id="expFilterCategory" onchange="window.onExpenseCategoryFilterChange()"><option value="">All</option></select></div>
            <div class="form-group"><label>Subcategory</label><select id="expFilterSubcategory" onchange="window.refreshExpenseList()"><option value="">All</option></select></div>
            <div class="form-group"><label>Bucket</label><select id="expFilterBucket" onchange="window.refreshExpenseList()"><option value="">All</option></select></div>
          </div>"""
content = content.replace(old_html, new_html)


# 2. Update filtering methods
old_filters = """function expenseMatchesCategoryFilter(exp, filterKey) {
  if (!filterKey) return true;
  if (filterKey.startsWith('id:')) {
    return exp.category_id === filterKey.slice(3);
  }
  if (filterKey.startsWith('label:')) {
    return getExpenseCategoryLabel(exp, teamCategoriesCache) === filterKey.slice(6);
  }
  return true;
}

function populateExpenseCategoryFilter(budgetId = '') {
  const select = document.getElementById('expFilterCategory');
  if (!select) return;
  const current = select.value;
  select.innerHTML = '<option value="">All</option>';

  const seen = new Set();
  const addOption = (value, label) => {
    if (!value || !label || seen.has(value)) return;
    seen.add(value);
    const safeLabel = label.replace(/</g, '&lt;');
    select.innerHTML += `<option value="${value.replace(/"/g, '&quot;')}">${safeLabel}</option>`;
  };

  const budgets = budgetId
    ? teamBudgetsCache.filter(b => b.id === budgetId)
    : teamBudgetsCache;

  budgets.forEach(budget => {
    getBudgetCategoryOptions(budget, teamCategoriesCache).forEach(opt => {
      const key = opt.categoryId ? `id:${opt.categoryId}` : `label:${opt.label}`;
      addOption(key, opt.label);
    });
  });

  teamExpensesCache.forEach(exp => {
    if (budgetId && exp.budget_id !== budgetId) return;
    const label = getExpenseCategoryLabel(exp, teamCategoriesCache);
    if (exp.category_id) {
      addOption(`id:${exp.category_id}`, label);
    } else if (label && label !== '—') {
      addOption(`label:${label}`, label);
    }
  });

  if (current && seen.has(current)) select.value = current;
}"""

new_filters = """window.onExpenseCategoryFilterChange = function() {
  populateExpenseSubcategoryFilter();
  window.refreshExpenseList();
};

function populateExpenseCategoryFilter(budgetId = '') {
  const select = document.getElementById('expFilterCategory');
  if (!select) return;
  const current = select.value;
  select.innerHTML = '<option value="">All</option>';
  
  (teamCategoriesCache || []).forEach(cat => {
    select.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
  });
  
  if (current) select.value = current;
  populateExpenseSubcategoryFilter();
}

function populateExpenseSubcategoryFilter() {
  const catId = document.getElementById('expFilterCategory')?.value;
  const subSelect = document.getElementById('expFilterSubcategory');
  if (!subSelect) return;
  const current = subSelect.value;
  subSelect.innerHTML = '<option value="">All</option>';
  
  if (catId) {
    const cat = (teamCategoriesCache || []).find(c => c.id === catId);
    if (cat && cat.subcategories) {
      cat.subcategories.forEach(sub => {
        subSelect.innerHTML += `<option value="${sub.id}">${sub.name}</option>`;
      });
    }
  }
  if (current) subSelect.value = current;
}"""
content = content.replace(old_filters, new_filters)

# 3. Update getFilteredExpenses
old_get_filtered = """function getFilteredExpenses() {
  const budgetId = document.getElementById('expFilterBudget')?.value;
  const categoryKey = document.getElementById('expFilterCategory')?.value;
  const bucketId = document.getElementById('expFilterBucket')?.value;
  const start = document.getElementById('expFilterStart')?.value;
  const end = document.getElementById('expFilterEnd')?.value;

  return teamExpensesCache.filter(e => {
    if (budgetId && e.budget_id !== budgetId) return false;
    if (!expenseMatchesCategoryFilter(e, categoryKey)) return false;
    if (bucketId && e.bucket_id !== bucketId) return false;"""

new_get_filtered = """function getFilteredExpenses() {
  const budgetId = document.getElementById('expFilterBudget')?.value;
  const catId = document.getElementById('expFilterCategory')?.value;
  const subcatId = document.getElementById('expFilterSubcategory')?.value;
  const bucketId = document.getElementById('expFilterBucket')?.value;
  const start = document.getElementById('expFilterStart')?.value;
  const end = document.getElementById('expFilterEnd')?.value;

  return teamExpensesCache.filter(e => {
    if (budgetId && e.budget_id !== budgetId) return false;
    if (catId && e.category_id !== catId) return false;
    if (subcatId && e.subcategory_id !== subcatId) return false;
    if (bucketId && e.bucket_id !== bucketId) return false;"""
content = content.replace(old_get_filtered, new_get_filtered)

# 4. update clear filter
old_clear = """  document.getElementById('expFilterCategory').value = '';
  document.getElementById('expFilterBucket').value = '';"""
new_clear = """  document.getElementById('expFilterCategory').value = '';
  if(document.getElementById('expFilterSubcategory')) document.getElementById('expFilterSubcategory').value = '';
  document.getElementById('expFilterBucket').value = '';"""
content = content.replace(old_clear, new_clear)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("expenses.js categories patched!")
