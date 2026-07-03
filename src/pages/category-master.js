// ==================== CATEGORY MASTER (ADMIN) ====================
import { state } from '../state.js';
import { supabaseClient } from '../db.js';
import { showToast } from '../components/toasts.js';

let masterData = [];

function isOrgAdmin() {
  return ['admin', 'caoh', 'oh', 'ceo'].includes(state.user?.role);
}

export function getCategoryMasterPage() {
  if (!isOrgAdmin()) {
    return `
      <h1 class="page-title">Category Master</h1>
      <div class="card"><h2>⛔ Access Denied</h2><p>Only org admins can edit the category template.</p></div>
    `;
  }

  return `
    <h1 class="page-title">Category Master</h1>
    <p style="color: var(--text-secondary); margin-bottom: 16px;">
      Default categories for new budgets. Mandatory items must appear on every new budget. Teams can add extra lines later.
    </p>

    <div class="card">
      <h2>➕ Add Category</h2>
      <form id="addCategoryMasterForm" onsubmit="window.addCategoryMaster(event)">
        <div class="form-grid-row form-grid-row--filter-simple" style="max-width:600px;">
          <div class="form-group">
            <label>Category Name</label>
            <input type="text" id="newMasterCategoryName" required placeholder="e.g. Transport">
          </div>
          <div class="form-group">
            <label>Mandatory on new budgets</label>
            <select id="newMasterCategoryMandatory">
              <option value="true" selected>Yes</option>
              <option value="false">No</option>
            </select>
          </div>
        </div>
        <button type="submit">Add Category</button>
      </form>
    </div>

    <div class="card">
      <h2>📂 Org Template</h2>
      <div id="categoryMasterList">
        <p class="empty-state">Loading…</p>
      </div>
    </div>
  `;
}

export async function initCategoryMasterPage() {
  if (!isOrgAdmin()) return;

  window.addCategoryMaster = addCategoryMaster;
  window.addSubcategoryMaster = addSubcategoryMaster;
  window.toggleCategoryMandatory = toggleCategoryMandatory;
  window.deleteCategoryMaster = deleteCategoryMaster;
  window.deleteSubcategoryMaster = deleteSubcategoryMaster;

  await loadMaster();
}

async function loadMaster() {
  const container = document.getElementById('categoryMasterList');
  if (!container) return;
  container.innerHTML = '<p class="empty-state">Loading…</p>';

  try {
    const { data: categories, error: catErr } = await supabaseClient
      .from('category_master')
      .select('*')
      .eq('is_deleted', false)
      .order('sort_order');

    if (catErr) throw catErr;

    const { data: subs, error: subErr } = await supabaseClient
      .from('subcategory_master')
      .select('*')
      .eq('is_deleted', false)
      .order('sort_order');

    if (subErr) throw subErr;

    masterData = (categories || []).map(c => ({
      ...c,
      subcategories: (subs || []).filter(s => s.category_master_id === c.id)
    }));

    if (masterData.length === 0) {
      container.innerHTML = '<p class="empty-state">No categories yet. Run the SQL seed or add categories above.</p>';
      return;
    }

    container.innerHTML = masterData.map(cat => `
      <div class="master-category-block" style="margin-bottom:20px; padding-bottom:16px; border-bottom:1px solid var(--border);">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <strong>${cat.name}</strong>
          <div style="display:flex; gap:8px; align-items:center;">
            <label style="font-size:0.85em; display:flex; align-items:center; gap:4px;">
              <input type="checkbox" ${cat.is_mandatory ? 'checked' : ''} onchange="window.toggleCategoryMandatory('${cat.id}', this.checked)">
              Mandatory
            </label>
            <button type="button" class="danger" style="padding:4px 10px; font-size:0.85em;" onclick="window.deleteCategoryMaster('${cat.id}')">Delete</button>
          </div>
        </div>
        <ul style="margin:10px 0 0 20px; color:var(--text-secondary);">
          ${cat.subcategories.length
            ? cat.subcategories.map(s => `
              <li style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <span>${s.name}${s.is_mandatory ? ' <em>(required)</em>' : ''}</span>
                <button type="button" class="secondary" style="padding:2px 8px; font-size:0.8em;" onclick="window.deleteSubcategoryMaster('${s.id}')">×</button>
              </li>
            `).join('')
            : '<li><em>No subcategories</em></li>'}
        </ul>
        <form style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;" onsubmit="window.addSubcategoryMaster(event, '${cat.id}')">
          <input type="text" name="subName" placeholder="Add subcategory" required style="flex:1; min-width:160px;">
          <button type="submit" class="secondary" style="padding:6px 12px;">+ Sub</button>
        </form>
      </div>
    `).join('');
  } catch (err) {
    console.error('Load category master error:', err);
    container.innerHTML = `<p class="empty-state" style="color:#dc3545;">${err.message}. Run the SQL migration first.</p>`;
  }
}

async function addCategoryMaster(e) {
  e.preventDefault();
  const name = document.getElementById('newMasterCategoryName').value.trim();
  const is_mandatory = document.getElementById('newMasterCategoryMandatory').value === 'true';
  const sort_order = masterData.length + 1;

  try {
    const { error } = await supabaseClient.from('category_master').insert({
      name,
      is_mandatory,
      sort_order,
      created_by: state.user?.id
    });
    if (error) throw error;
    showToast(`Category "${name}" added`, 'success');
    e.target.reset();
    await loadMaster();
  } catch (err) {
    showToast(err.message || 'Failed to add category', 'error');
  }
}

async function addSubcategoryMaster(e, categoryId) {
  e.preventDefault();
  const input = e.target.querySelector('input[name="subName"]');
  const name = input.value.trim();
  const cat = masterData.find(c => c.id === categoryId);
  const sort_order = (cat?.subcategories?.length || 0) + 1;

  try {
    const { error } = await supabaseClient.from('subcategory_master').insert({
      category_master_id: categoryId,
      name,
      sort_order
    });
    if (error) throw error;
    showToast(`Subcategory "${name}" added`, 'success');
    await loadMaster();
  } catch (err) {
    showToast(err.message || 'Failed to add subcategory', 'error');
  }
}

async function toggleCategoryMandatory(id, checked) {
  try {
    const { error } = await supabaseClient
      .from('category_master')
      .update({ is_mandatory: checked, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    showToast('Updated', 'success');
  } catch (err) {
    showToast(err.message, 'error');
    await loadMaster();
  }
}

async function deleteCategoryMaster(id) {
  if (!confirm('Delete this category and all its subcategories?')) return;
  try {
    await supabaseClient.from('subcategory_master').update({ is_deleted: true }).eq('category_master_id', id);
    const { error } = await supabaseClient.from('category_master').update({ is_deleted: true }).eq('id', id);
    if (error) throw error;
    showToast('Category deleted', 'success');
    await loadMaster();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteSubcategoryMaster(id) {
  if (!confirm('Delete this subcategory?')) return;
  try {
    const { error } = await supabaseClient.from('subcategory_master').update({ is_deleted: true }).eq('id', id);
    if (error) throw error;
    showToast('Subcategory deleted', 'success');
    await loadMaster();
  } catch (err) {
    showToast(err.message, 'error');
  }
}
