// ==================== BUDGET TYPES PAGE ====================
// Page for CRUD operations on budget types (Monthly, Medical, Travel, etc.)
// Accessible to FIH and users with finance_setup app role
import { state } from '../state.js';
import { supabaseClient } from '../db.js';
import { showToast, showConfirm } from '../components/toasts.js';
import { createModal, openModal, closeModal } from '../components/modals.js';
import { btnIconEdit, btnIconDelete } from '../utils/uiHelpers.js';
import { loadBudgetTypes as loadGlobalBudgetTypes, resetBudgetTypesCache } from '../utils/budgetTypes.js';

let budgetTypesList = [];

export function getBudgetTypesPage() {
  return `
    <h1 class="page-title">Budget Types</h1>
    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 10px;">
        <h2>📋 Budget Type Management</h2>
        <button id="addBudgetTypeBtn" class="success" onclick="window.openBudgetTypeModal()" style="display: none;">
          + Add Budget Type
        </button>
      </div>
      <p style="color: #666; margin-bottom: 20px;">
        Define the <strong>org-wide</strong> budget types available to every team.
        Each team's budget creation uses these types and their assigned templates.
      </p>
      <div id="budgetTypesList">Loading budget types...</div>
    </div>
    ${getEditBudgetTypeModal()}
  `;
}

function getEditBudgetTypeModal() {
  return `
    <div id="editBudgetTypeModal" class="modal">
      <div class="modal-content" style="max-width: 500px;">
        <div class="modal-header" style="position: relative;">
          <h2 id="modalTitle" style="margin: 0;">Add Budget Type</h2>
          <button class="close-btn" onclick="window.closeBudgetTypeModal()" style="position: absolute; top: 10px; right: 10px; background: var(--danger); color: white; border: none; border-radius: 4px; width: 32px; height: 32px; cursor: pointer; font-size: 18px; padding: 0; display: flex; align-items: center; justify-content: center;">✕</button>
        </div>
        <form id="budgetTypeForm" onsubmit="window.saveBudgetType(event)">
          <div class="form-group">
            <label for="btName">Type Name *</label>
            <input type="text" id="btName" required placeholder="e.g., Medical, Travel">
          </div>
          <div class="form-group">
            <label for="btCode">Type Code *</label>
            <input type="text" id="btCode" required pattern="[a-z0-9-]+" placeholder="e.g., medical, passport-visa" style="text-transform: lowercase;">
            <small style="color: #666; display: block; margin-top: 5px;">Stable lowercase code stored on each budget (e.g. <code>medical</code>, <code>travel</code>).</small>
          </div>
          <div class="form-group">
            <label for="btLabel">Display Label *</label>
            <input type="text" id="btLabel" required placeholder="e.g., Monthly Expense Budget">
          </div>
          <div class="form-group">
            <label for="btDescription">Description</label>
            <textarea id="btDescription" rows="3" placeholder="Brief description of this budget type"></textarea>
          </div>
          <div class="form-group" style="display: flex; gap: 10px; align-items: center;">
            <input type="checkbox" id="btActive">
            <label for="btActive" style="margin: 0;">Active (can be used in new budgets)</label>
            <span style="color: #666; font-size: 0.85em; margin-left: auto;">Inactive types hide from new budget creation</span>
          </div>
          <div class="form-actions">
            <button type="button" class="secondary" onclick="window.closeBudgetTypeModal()">Cancel</button>
            <button type="submit" class="primary">Save</button>
            <button type="button" id="deleteBudgetTypeBtn" class="danger" style="display: none;">Delete</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

export async function initBudgetTypesPage() {
  const role = String(state.user?.role || '').toLowerCase();
  const isOrgAdmin = ['admin', 'caoh', 'oh', 'ceo', 'fih'].includes(role);
  const hasFinanceSetupRole = state.appRoleAssignments?.some(ar => ar.app_code === 'finance_setup');
  const canEdit = isOrgAdmin || hasFinanceSetupRole;

  const addBtn = document.getElementById('addBudgetTypeBtn');
  if (addBtn && canEdit) {
    addBtn.style.display = 'inline-block';
  }

  window.openBudgetTypeModal = openBudgetTypeModal;
  window.closeBudgetTypeModal = closeBudgetTypeModal;
  window.saveBudgetType = saveBudgetType;
  window.deleteBudgetTypeBtn = deleteBudgetType;

  await loadBudgetTypes();
  // Keep the shared global cache in sync so the create-budget dropdown sees new types
  await loadGlobalBudgetTypes();
  renderBudgetTypesList();
}

async function loadBudgetTypes() {
  try {
    // Budget types are org-global definitions (no team scope)
    const { data, error } = await supabaseClient
      .from('budget_types')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      if (error.message.includes('does not exist')) {
        // Table doesn't exist yet, show empty state
        budgetTypesList = [];
      } else {
        throw error;
      }
    } else {
      budgetTypesList = data || [];
    }
  } catch (err) {
    console.error('Failed to load budget types:', err);
    budgetTypesList = [];
  }
}

function renderBudgetTypesList() {
  const listDiv = document.getElementById('budgetTypesList');
  if (!listDiv) return;

  if (budgetTypesList.length === 0) {
    listDiv.innerHTML = `
      <div class="empty-state">
        <p>📭 No budget types defined yet.</p>
        <p style="color: #666; font-size: 0.9em;">Create your first budget type to get started.</p>
      </div>
    `;
    return;
  }

  const role = String(state.user?.role || '').toLowerCase();
  const isOrgAdmin = ['admin', 'caoh', 'oh', 'ceo', 'fih'].includes(role);
  const hasFinanceSetupRole = state.appRoleAssignments?.some(ar => ar.app_code === 'finance_setup');
  const canEdit = isOrgAdmin || hasFinanceSetupRole;

  const html = `
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr style="border-bottom: 2px solid var(--border); text-align: left;">
          <th style="padding: 12px; font-weight: 600;">Type Name</th>
          <th style="padding: 12px; font-weight: 600;">Code</th>
          <th style="padding: 12px; font-weight: 600;">Label</th>
          <th style="padding: 12px; font-weight: 600;">Status</th>
          <th style="padding: 12px; font-weight: 600;">Last Modified</th>
          ${canEdit ? '<th style="padding: 12px; font-weight: 600;">Actions</th>' : ''}
        </tr>
      </thead>
      <tbody>
        ${budgetTypesList.map(bt => `
          <tr style="border-bottom: 1px solid var(--border); transition: background 0.2s;">
            <td style="padding: 12px; font-weight: 500;">${escapeHtml(bt.name)}</td>
            <td style="padding: 12px;"><code style="background: rgba(0,0,0,0.05); padding: 2px 6px; border-radius: 4px;">${escapeHtml(bt.code || '')}</code></td>
            <td style="padding: 12px;">${escapeHtml(bt.label)}</td>
            <td style="padding: 12px;">
              <span style="
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 0.85em;
                background: ${bt.is_active ? '#dcfce7' : '#fecaca'};
                color: ${bt.is_active ? '#166534' : '#991b1b'};
              ">
                ${bt.is_active ? '✓ Active' : '✕ Inactive'}
              </span>
            </td>
            <td style="padding: 12px; font-size: 0.9em; color: #666;">
              ${bt.updated_at ? formatDate(bt.updated_at) : 'N/A'}
            </td>
            ${canEdit ? `
              <td style="padding: 12px;">
                ${btnIconEdit(`window.openBudgetTypeModal(${bt.id})`)}
              </td>
            ` : ''}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  listDiv.innerHTML = html;
}

async function openBudgetTypeModal(budgetTypeId = null) {
  const modal = document.getElementById('editBudgetTypeModal');
  if (!modal) return;

  const form = document.getElementById('budgetTypeForm');
  const modalTitle = document.getElementById('modalTitle');
  const deleteBtn = document.getElementById('deleteBudgetTypeBtn');

  if (budgetTypeId) {
    const bt = budgetTypesList.find(b => b.id === budgetTypeId);
    if (!bt) return;

    modalTitle.textContent = 'Edit Budget Type';
    document.getElementById('btName').value = bt.name || '';
    document.getElementById('btCode').value = bt.code || '';
    document.getElementById('btLabel').value = bt.label || '';
    document.getElementById('btDescription').value = bt.description || '';
    document.getElementById('btActive').checked = bt.is_active !== false;
    deleteBtn.style.display = 'inline-block';
    deleteBtn.onclick = () => deleteBudgetType(budgetTypeId);

    form.dataset.budgetTypeId = budgetTypeId;
  } else {
    modalTitle.textContent = 'Add Budget Type';
    form.reset();
    deleteBtn.style.display = 'none';
    delete form.dataset.budgetTypeId;
  }

  modal.classList.add('active');
}

function closeBudgetTypeModal() {
  const modal = document.getElementById('editBudgetTypeModal');
  if (modal) modal.classList.remove('active');
}

async function saveBudgetType(event) {
  event.preventDefault();

  const name = document.getElementById('btName').value.trim();
  const code = (document.getElementById('btCode').value || '').trim().toLowerCase();
  const label = document.getElementById('btLabel').value.trim();
  const description = document.getElementById('btDescription').value.trim();
  const isActive = document.getElementById('btActive').checked;

  if (!name || !label || !code) {
    showToast('Type name, code and label are required', 'warning');
    return;
  }
  if (!/^[a-z0-9-]+$/.test(code)) {
    showToast('Type code must be lowercase letters, numbers and hyphens only (e.g. passport-visa)', 'warning');
    return;
  }

  const form = event.target;
  const budgetTypeId = form.dataset.budgetTypeId ? parseInt(form.dataset.budgetTypeId) : null;

  try {
    const payload = {
      name,
      code,
      label,
      description,
      is_active: isActive,
      updated_at: new Date().toISOString(),
      updated_by: state.user.id
    };

    if (budgetTypeId) {
      const { error } = await supabaseClient
        .from('budget_types')
        .update(payload)
        .eq('id', budgetTypeId);

      if (error) throw error;
      showToast('Budget type updated successfully', 'success');
    } else {
      const { error } = await supabaseClient
        .from('budget_types')
        .insert([{
          ...payload,
          created_at: new Date().toISOString(),
          created_by: state.user.id
        }]);

      if (error) throw error;
      showToast('Budget type added successfully', 'success');
    }

    closeBudgetTypeModal();
    resetBudgetTypesCache();
    await loadBudgetTypes();
    await loadGlobalBudgetTypes();
    renderBudgetTypesList();
  } catch (err) {
    console.error('Error saving budget type:', err);
    showToast(err.message || 'Failed to save budget type', 'error');
  }
}

async function deleteBudgetType(budgetTypeId) {
  const type = budgetTypesList.find(b => b.id === budgetTypeId);
  if (!type) return;

  const ok = await showConfirm(`Delete budget type "${type.name || type.label}"? This cannot be undone.`);
  if (!ok) return;

  try {
    // Check if the type code is used in any budgets (soft-deactivate instead when in use)
    const { count, error: countErr } = await supabaseClient
      .from('budget_plans')
      .select('id', { count: 'exact', head: true })
      .eq('budget_type', type.code)
      .eq('is_deleted', false);

    if (countErr) throw countErr;

    if (count && count > 0) {
      showToast('Cannot delete a budget type that is used by existing budgets. Deactivate it instead.', 'warning');
      return;
    }

    const { error } = await supabaseClient
      .from('budget_types')
      .delete()
      .eq('id', budgetTypeId);

    if (error) throw error;

    showToast('Budget type deleted', 'success');
    closeBudgetTypeModal();
    resetBudgetTypesCache();
    await loadBudgetTypes();
    await loadGlobalBudgetTypes();
    renderBudgetTypesList();
  } catch (err) {
    console.error('Error deleting budget type:', err);
    showToast(err.message || 'Failed to delete budget type', 'error');
  }
}

function formatDate(dateStr) {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return dateStr;
  }
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
