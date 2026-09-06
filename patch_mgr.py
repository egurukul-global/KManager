import sys
import re

file_path = r'C:\Users\dell\Documents\GitHub\KManager-test\src\pages\manager-expenses.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace HTML filters
old_html = """          <div class="form-grid-row form-grid-row--filter-main">
            <div class="form-group">
              <label>Search</label>
              <input type="text" id="mgrExpSearch" placeholder="Search item..." oninput="window.refreshManagerExpenseList()">
            </div>
            <div class="form-group">
              <label>Team</label>
              <select id="mgrExpTeamFilter" onchange="window.reloadManagerExpensesFromServer()"><option value="">All Teams</option></select>
            </div>
            <div class="form-group">
              <label>Budget</label>
              <select id="mgrExpBudgetFilter" onchange="window.refreshManagerExpenseList()"><option value="">All Budgets</option></select>
            </div>
          </div>"""

new_html = """          <div class="form-grid-row" style="grid-template-columns: repeat(2, 1fr); width: 100%;">
            <div class="form-group">
              <label>Search</label>
              <input type="text" id="mgrExpSearch" placeholder="Search item..." oninput="window.refreshManagerExpenseList()">
            </div>
            <div class="form-group">
              <label>Team</label>
              <select id="mgrExpTeamFilter" onchange="window.reloadManagerExpensesFromServer()"><option value="">All Teams</option></select>
            </div>
          </div>
          <div class="form-grid-row form-grid-row--filter-main" style="grid-template-columns: repeat(4, 1fr); width: 100%; margin-top: 12px;">
            <div class="form-group">
              <label>Budget</label>
              <select id="mgrExpBudgetFilter" onchange="window.refreshManagerExpenseList()"><option value="">All Budgets</option></select>
            </div>
            <div class="form-group">
              <label>Category</label>
              <select id="mgrExpCategoryFilter" onchange="window.refreshManagerExpenseList()"><option value="">All Categories</option></select>
            </div>
            <div class="form-group">
              <label>Subcategory</label>
              <select id="mgrExpSubcategoryFilter" onchange="window.refreshManagerExpenseList()"><option value="">All Subcategories</option></select>
            </div>
            <div class="form-group">
              <label>Bucket</label>
              <select id="mgrExpBucketFilter" onchange="window.refreshManagerExpenseList()"><option value="">All Buckets</option></select>
            </div>
          </div>"""
content = content.replace(old_html, new_html)

# Replace table head
old_thead = """              <th>Category</th>
              <th>Local</th>"""
new_thead = """              <th>Category</th>
              <th>Subcategory</th>
              <th>Local</th>"""
content = content.replace(old_thead, new_thead)

# Replace colspan
content = content.replace('colspan="10"', 'colspan="11"')

# Update query to include buckets(name)
old_query = ".select('id, date, item, usd_amount, local_amount, currency, receipt_url, budget_id, category_id, subcategory_id, bucket_id, is_reviewed, is_submitted, team_id, teams(name), budget_plans(name), category_master(name), subcategory_master(name), vendor_info')"
new_query = ".select('id, date, item, usd_amount, local_amount, currency, receipt_url, budget_id, category_id, subcategory_id, bucket_id, is_reviewed, is_submitted, team_id, teams(name), budget_plans(name), category_master(name), subcategory_master(name), buckets(name), vendor_info')"
content = content.replace(old_query, new_query)

# Update reset function
old_reset = """  document.getElementById('mgrExpBudgetFilter').value = '';
  document.getElementById('mgrExpDateFrom').value = '';"""
new_reset = """  document.getElementById('mgrExpBudgetFilter').value = '';
  const cEl = document.getElementById('mgrExpCategoryFilter'); if(cEl) cEl.value = '';
  const sEl = document.getElementById('mgrExpSubcategoryFilter'); if(sEl) sEl.value = '';
  const buckEl = document.getElementById('mgrExpBucketFilter'); if(buckEl) buckEl.value = '';
  document.getElementById('mgrExpDateFrom').value = '';"""
content = content.replace(old_reset, new_reset)

# Update populate dropdowns
old_dropdowns = """  // Populate dropdowns once
  const budSel = document.getElementById('mgrExpBudgetFilter');
  if (budSel && budSel.options.length <= 1) {
    const buds = [...new Set(pendingReviewsCache.map(e => e.budget_id))];
    buds.forEach(bid => {
      const name = pendingReviewsCache.find(e => e.budget_id === bid)?.budget_plans?.name || 'Unknown';
      budSel.innerHTML += `<option value="${bid}">${escapeHtml(name)}</option>`;
    });
  }"""
new_dropdowns = """  // Populate dropdowns once
  const budSel = document.getElementById('mgrExpBudgetFilter');
  if (budSel && budSel.options.length <= 1) {
    const buds = [...new Set(pendingReviewsCache.map(e => e.budget_id).filter(Boolean))];
    buds.forEach(bid => {
      const name = pendingReviewsCache.find(e => e.budget_id === bid)?.budget_plans?.name || 'Unknown';
      budSel.innerHTML += `<option value="${bid}">${escapeHtml(name)}</option>`;
    });
  }
  const catSel = document.getElementById('mgrExpCategoryFilter');
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
  }
  const bucketSel = document.getElementById('mgrExpBucketFilter');
  if (bucketSel && bucketSel.options.length <= 1) {
    const bucks = [...new Set(pendingReviewsCache.map(e => e.bucket_id).filter(Boolean))];
    bucks.forEach(bid => {
      const name = pendingReviewsCache.find(e => e.bucket_id === bid)?.buckets?.name || 'Unknown';
      bucketSel.innerHTML += `<option value="${bid}">${escapeHtml(name)}</option>`;
    });
  }"""
content = content.replace(old_dropdowns, new_dropdowns)

# Update filtering logic
old_filter = """  if (bId) filtered = filtered.filter(e => e.budget_id === bId);
  if (dFrom) filtered = filtered.filter(e => e.date >= dFrom);"""
new_filter = """  if (bId) filtered = filtered.filter(e => e.budget_id === bId);
  const cId = document.getElementById('mgrExpCategoryFilter')?.value || '';
  const sId = document.getElementById('mgrExpSubcategoryFilter')?.value || '';
  const buckId = document.getElementById('mgrExpBucketFilter')?.value || '';
  if (cId) filtered = filtered.filter(e => e.category_id === cId);
  if (sId) filtered = filtered.filter(e => e.subcategory_id === sId);
  if (buckId) filtered = filtered.filter(e => e.bucket_id === buckId);
  if (dFrom) filtered = filtered.filter(e => e.date >= dFrom);"""
content = content.replace(old_filter, new_filter)

# Update table rows
old_rows = """    const catName = exp.category_master?.name || (exp.vendor_info && exp.vendor_info.startsWith('budget_cat:') ? exp.vendor_info.replace('budget_cat:', '') : null);
    const subName = exp.subcategory_master?.name || null;
    const catLabel = catName ? (subName ? `${catName} → ${subName}` : catName) : (exp.category_id || '-');
    const statusPill = exp.is_reviewed 
      ? `<span class="status-pill success" style="font-size:0.7em;">Reviewed</span>` 
      : `<span class="status-pill info" style="font-size:0.7em;">Pending Review</span>`;
      
    return `
      <tr>
        <td>${exp.is_reviewed ? '-' : `<input type="checkbox" class="mgr-exp-cb" value="${exp.id}">`}</td>
        <td>${escapeHtml(exp.date)}</td>
        <td>${escapeHtml(exp.teams?.name || 'Unknown')}</td>
        <td>${escapeHtml(exp.item)}</td>
        <td>${escapeHtml(catLabel)}</td>
        <td>${(exp.local_amount || 0).toLocaleString()} ${exp.currency || ''}</td>"""

new_rows = """    const catName = exp.category_master?.name || (exp.vendor_info && exp.vendor_info.startsWith('budget_cat:') ? exp.vendor_info.replace('budget_cat:', '') : null);
    const subName = exp.subcategory_master?.name || null;
    const statusPill = exp.is_reviewed 
      ? `<span class="status-pill success" style="font-size:0.7em;">Reviewed</span>` 
      : `<span class="status-pill info" style="font-size:0.7em;">Pending Review</span>`;
      
    return `
      <tr>
        <td>${exp.is_reviewed ? '-' : `<input type="checkbox" class="mgr-exp-cb" value="${exp.id}">`}</td>
        <td>${escapeHtml(exp.date)}</td>
        <td>${escapeHtml(exp.teams?.name || 'Unknown')}</td>
        <td>${escapeHtml(exp.item)}</td>
        <td>${escapeHtml(catName || '-')}</td>
        <td>${escapeHtml(subName || '-')}</td>
        <td>${(exp.local_amount || 0).toLocaleString()} ${exp.currency || ''}</td>"""
content = content.replace(old_rows, new_rows)


with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("manager-expenses.js patched successfully")
