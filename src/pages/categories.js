// ==================== CATEGORIES PAGE ====================
import { state } from '../state.js';
import { sbSelect, sbInsert, sbUpdate, sbSoftDelete, sbRestore } from '../db.js';
import { showToast, showConfirm } from '../components/toasts.js';
import { createModal, openModal, closeModal } from '../components/modals.js';

let allCategories = [];

export function getCategoriesPage() {
  return `
    <h1 class="page-title">Budget Categories</h1>
    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 10px;">
        <h2>📂 Master Category List</h2>
        <div style="display: flex; gap: 10px; align-items: center;">
          <button id="showDeletedCatBtn" class="secondary small" onclick="window.toggleShowDeletedCategories()" style="display: none;">
            👁️ Show Deleted
          </button>
          <button id="addCategoryBtn" class="success" onclick="window.openCategoryModal()" style="display: none;">+ Add Category</button>
        </div>
      </div>
      <p style="color: #666; margin-bottom: 20px;">
        Categories are shared across all budgets for <strong>${state.currentTeam?.team_name || 'current team'}</strong>.
        <span id="categoryAccessNote" style="color: #999; font-size: 0.9em;"></span>
      </p>
      <div id="categoriesList">Loading categories...</div>
    </div>
  `;
}

export async function initCategoriesPage() {
  const addBtn = document.getElementById('addCategoryBtn');
  const accessNote = document.getElementById('categoryAccessNote');
  const showDeletedBtn = document.getElementById('showDeletedCatBtn');

  if (state.canCreateCategories) {
    addBtn.style.display = 'inline-block';
    accessNote.textContent = '';
  } else {
    addBtn.style.display = 'none';
    accessNote.textContent = ' (View only)';
  }

  if (state.canDeleteCategories && showDeletedBtn) {
    showDeletedBtn.style.display = 'inline-block';
    showDeletedBtn.textContent = state.showDeleted ? '🙈 Hide Deleted' : '👁️ Show Deleted';
  }

  window.openCategoryModal = openCategoryModal;
  window.toggleShowDeletedCategories = toggleShowDeletedCategories;
  window.saveCategory = saveCategory;
  window.loadCategoryForEdit = loadCategoryForEdit;
  window.confirmDeleteCategory = confirmDeleteCategory;
  window.restoreCategory = restoreCategory;

  await loadCategories();
}

async function loadCategories() {
  const container = document.getElementById('categoriesList');
  container.innerHTML = '<div class="empty-state">Loading categories...</div>';

  try {
    const { data: categories, error } = await sbSelect('categories', {
      teamId: state.currentTeam.team_id,
      includeDeleted: state.showDeleted,
      orderBy: 'name',
      ascending: true
    });

    if (error) throw error;

    allCategories = categories || [];
    renderCategories();

  } catch (err) {
    console.error('Load categories error:', err);
    container.innerHTML = `<div class="empty-state" style="color: #dc3545;">Error loading categories: ${err.message}</div>`;
    showToast('Failed to load categories', 'error');
  }
}

function renderCategories() {
  const container = document.getElementById('categoriesList');

  if (allCategories.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">📂</div>
        <h3>No categories yet</h3>
        <p>${state.showDeleted ? 'No deleted categories found.' : 'Create your first budget category to get started.'}</p>
        ${!state.showDeleted && state.canCreateCategories ? '<button class="success" onclick="window.openCategoryModal()" style="margin-top: 15px;">+ Add Category</button>' : ''}
      </div>
    `;
    return;
  }

  let html = '<div class="category-grid">';

  allCategories.forEach(cat => {
    const isDeleted = cat.is_deleted === true;
    const canEdit = state.canEditCategories && !isDeleted;
    const canDelete = state.canDeleteCategories && !isDeleted;
    const canRestore = state.canDeleteCategories && isDeleted;

    html += `
      <div class="category-tag ${isDeleted ? 'deleted' : ''}" style="${isDeleted ? 'opacity: 0.6; background: #f8f9fa;' : ''}">
        <span>${cat.name}</span>
        <div class="cat-actions">
          ${canEdit ? `<button class="info small" onclick="window.loadCategoryForEdit('${cat.id}')">Edit</button>` : ''}
          ${canDelete ? `<button class="danger small" onclick="window.confirmDeleteCategory('${cat.id}', '${cat.name}')">×</button>` : ''}
          ${canRestore ? `<button class="success small" onclick="window.restoreCategory('${cat.id}')">Restore</button>` : ''}
        </div>
      </div>
    `;
  });

  html += '</div>';
  container.innerHTML = html;
}

// ==================== MODAL FUNCTIONS ====================

function openCategoryModal(categoryId = null) {
  const isEdit = !!categoryId;
  const modalId = 'categoryModal';

  const content = `
    <h2>${isEdit ? '✏️ Edit Category' : '➕ Add Category'}</h2>
    <form id="categoryForm" onsubmit="window.saveCategory(event)">
      <input type="hidden" id="categoryId" value="${categoryId || ''}">
      <div class="form-grid" style="max-width: 500px;">
        <div class="form-group">
          <label>Category Name *</label>
          <input type="text" id="categoryName" placeholder="e.g., Food, Rent, Travel, Visa" required>
        </div>
        <div class="form-group full-width">
          <label>Description (Optional)</label>
          <textarea id="categoryDescription" placeholder="Notes about this category..."></textarea>
        </div>
      </div>
      <div class="btn-group">
        <button type="submit">${isEdit ? 'Save Changes' : 'Add Category'}</button>
        <button type="button" class="secondary" onclick="document.getElementById('${modalId}').classList.remove('active')">Cancel</button>
      </div>
    </form>
  `;

  createModal(modalId, content);
  openModal(modalId);

  if (isEdit) {
    const cat = allCategories.find(c => c.id === categoryId);
    if (cat) {
      document.getElementById('categoryName').value = cat.name;
      document.getElementById('categoryDescription').value = cat.description || '';
    }
  }
}

async function saveCategory(e) {
  e.preventDefault();

  const categoryId = document.getElementById('categoryId').value;
  const isEdit = !!categoryId;

  if (isEdit && !state.canEditCategories) {
    showToast('You do not have permission to edit categories', 'error');
    return;
  }
  if (!isEdit && !state.canCreateCategories) {
    showToast('You do not have permission to create categories', 'error');
    return;
  }

  const categoryData = {
    name: document.getElementById('categoryName').value.trim(),
    description: document.getElementById('categoryDescription').value.trim()
  };

  if (!categoryData.name) {
    showToast('Category name is required', 'error');
    return;
  }

  // Check for duplicate name
  const duplicate = allCategories.find(c => 
    c.name.toLowerCase() === categoryData.name.toLowerCase() && 
    c.id !== categoryId &&
    !c.is_deleted
  );
  if (duplicate) {
    showToast('A category with this name already exists', 'error');
    return;
  }

  try {
    if (isEdit) {
      const { error } = await sbUpdate('categories', categoryData, { id: categoryId });
      if (error) throw error;
      showToast(`Category "${categoryData.name}" updated!`, 'success');
    } else {
      categoryData.team_id = state.currentTeam.team_id;
      categoryData.created_by = state.user.id;
      categoryData.id = crypto.randomUUID();
      categoryData.created_at = new Date().toISOString();
      categoryData.is_deleted = false;

      const { error } = await sbInsert('categories', categoryData);
      if (error) throw error;
      showToast(`Category "${categoryData.name}" created!`, 'success');
    }

    closeModal('categoryModal');
    await loadCategories();

  } catch (err) {
    console.error('Save category error:', err);
    showToast('Failed to save category: ' + err.message, 'error');
  }
}

function loadCategoryForEdit(categoryId) {
  openCategoryModal(categoryId);
}

function confirmDeleteCategory(categoryId, categoryName) {
  showConfirm(
    `Delete category "<strong>${categoryName}</strong>"?<br><br>This will soft-delete the category. Existing budgets using this category will still reference it.`,
    async () => {
      if (!state.canDeleteCategories) {
        showToast('Permission denied', 'error');
        return;
      }

      try {
        const { error } = await sbSoftDelete('categories', categoryId);
        if (error) throw error;
        showToast('Category deleted', 'success');
        await loadCategories();
      } catch (err) {
        console.error('Delete category error:', err);
        showToast('Failed to delete: ' + err.message, 'error');
      }
    }
  );
}

async function restoreCategory(categoryId) {
  if (!state.canDeleteCategories) {
    showToast('Permission denied', 'error');
    return;
  }

  try {
    const { error } = await sbRestore('categories', categoryId);
    if (error) throw error;
    showToast('Category restored', 'success');
    await loadCategories();
  } catch (err) {
    console.error('Restore category error:', err);
    showToast('Failed to restore: ' + err.message, 'error');
  }
}

function toggleShowDeletedCategories() {
  state.showDeleted = !state.showDeleted;
  const btn = document.getElementById('showDeletedCatBtn');
  if (btn) {
    btn.textContent = state.showDeleted ? '🙈 Hide Deleted' : '👁️ Show Deleted';
  }
  loadCategories();
}
