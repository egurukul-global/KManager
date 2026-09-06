import sys

file_path = r'C:\Users\dell\Documents\GitHub\KManager-test\src\pages\manager-expenses.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. HTML changes
old_cat_html = """            <div class="form-group">
              <label>Category</label>
              <select id="mgrExpCategoryFilter" onchange="window.refreshManagerExpenseList()"><option value="">All Categories</option></select>
            </div>"""
new_cat_html = """            <div class="form-group">
              <label>Category</label>
              <select id="mgrExpCategoryFilter" onchange="window.updateMgrSubcategoryFilter()"><option value="">All Categories</option></select>
            </div>"""
content = content.replace(old_cat_html, new_cat_html)

# 2. window bindings and cache
content = content.replace("let mgrAttachmentsCache = [];", "let mgrAttachmentsCache = [];\nlet mgrTeamCategoriesCache = [];")

# 3. Add updateMgrSubcategoryFilter function
new_func = """window.updateMgrSubcategoryFilter = function() {
  const catId = document.getElementById('mgrExpCategoryFilter')?.value;
  const subcatSel = document.getElementById('mgrExpSubcategoryFilter');
  if (subcatSel) {
    subcatSel.innerHTML = '<option value="">All Subcategories</option>';
    if (catId && mgrTeamCategoriesCache.length > 0) {
      const cat = mgrTeamCategoriesCache.find(c => c.id === catId);
      if (cat && cat.subcategories) {
        cat.subcategories.forEach(sub => {
          subcatSel.innerHTML += `<option value="${sub.id}">${escapeHtml(sub.name)}</option>`;
        });
      }
    }
  }
  window.refreshManagerExpenseList();
};
"""
content = content.replace("window.refreshManagerExpenseList = function() {", new_func + "\nwindow.refreshManagerExpenseList = function() {")

# 4. Load category_master in loadPendingExpenses
old_load = """  // Load receipt attachments (child records) for the loaded expenses —
  // some expenses store receipts ONLY here, not in expenses.receipt_url.
  mgrAttachmentsCache = [];
  const expIds = (data || []).map(e => e.id);
  if (expIds.length) {
    const { data: atts, error: attErr } = await supabaseClient
      .from('expense_attachments')
      .select('id, expense_id, file_url, is_deleted')
      .in('expense_id', expIds);
    if (!attErr) mgrAttachmentsCache = atts || [];
  }"""
new_load = old_load + """
  
  if (mgrTeamCategoriesCache.length === 0) {
    try {
      const catModule = await import('../utils/categoryMaster.js');
      mgrTeamCategoriesCache = await catModule.loadCategoryMaster() || [];
    } catch (e) {
      console.error(e);
      mgrTeamCategoriesCache = [];
    }
  }"""
content = content.replace(old_load, new_load)

# 5. Populate dropdowns
old_dropdowns = """  const catSel = document.getElementById('mgrExpCategoryFilter');
  if (catSel && catSel.options.length <= 1) {
    const cats = [...new Set(pendingReviewsCache.map(e => e.category_id).filter(Boolean))];
    cats.forEach(cid => {
      const name = pendingReviewsCache.find(e => e.category_id === cid)?.category_master?.name || 'Unknown';
      catSel.innerHTML += `<option value="${cid}">${escapeHtml(name)}</option>`;
    });
  }
  const subcatSel = document.getElementById('mgrExpSubcategoryFilter');
  if (subcatSel && subcatSel.options.length <= 1) {
    const subcats = [...new Set(pendingReviewsCache.map(e => e.subcategory_id).filter(Boolean))];
    subcats.forEach(sid => {
      const name = pendingReviewsCache.find(e => e.subcategory_id === sid)?.subcategory_master?.name || 'Unknown';
      subcatSel.innerHTML += `<option value="${sid}">${escapeHtml(name)}</option>`;
    });
  }"""

new_dropdowns = """  const catSel = document.getElementById('mgrExpCategoryFilter');
  if (catSel && catSel.options.length <= 1 && mgrTeamCategoriesCache.length > 0) {
    mgrTeamCategoriesCache.forEach(c => {
      catSel.innerHTML += `<option value="${c.id}">${escapeHtml(c.name)}</option>`;
    });
  }
  // Subcategories are populated dynamically when a category is selected"""
content = content.replace(old_dropdowns, new_dropdowns)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("manager-expenses.js category loading fixed")
