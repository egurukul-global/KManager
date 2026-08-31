// ==================== BUDGET TEMPLATES PAGE ====================
// Page for creating and managing budget templates with category selection
// Accessible to FIH and users with finance_setup app role
import { state } from '../state.js';
import { supabaseClient } from '../db.js';
import { showToast, showConfirm } from '../components/toasts.js';
import { getBudgetTypeLabel } from '../utils/budgetTypes.js';

let templatesList = [];
let categoriesList = [];
let allBudgetTypes = [];
let assignmentsList = [];

export function getBudgetTemplatesPage() {
  return `
    <h1 class="page-title">Budget Templates</h1>
    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 10px;">
        <h2>📋 Budget Template Management</h2>
        <button id="addTemplateBtn" class="success" onclick="window.openTemplateModal()" style="display: none;">
          + Create Template
        </button>
      </div>
      <p style="color: #666; margin-bottom: 20px;">
        Create templates to automatically populate budget categories. Assign templates to budget types
        so new budgets include the right categories.
      </p>
      <div id="templatesList">Loading templates...</div>
    </div>
    ${getEditTemplateModal()}
  `;
}

function getEditTemplateModal() {
  return `
    <div id="editTemplateModal" class="modal" style="max-height: 90vh; overflow-y: auto;">
      <div class="modal-content" style="max-width: 600px;">
        <div class="modal-header" style="position: relative;">
          <h2 id="modalTitle" style="margin: 0;">Create Budget Template</h2>
          <button class="close-btn" onclick="window.closeTemplateModal()" style="position: absolute; top: 10px; right: 10px; background: var(--danger); color: white; border: none; border-radius: 4px; width: 32px; height: 32px; cursor: pointer; font-size: 18px; padding: 0; display: flex; align-items: center; justify-content: center;">✕</button>
        </div>
        <form id="templateForm" onsubmit="window.saveTemplate(event)">
          <div class="form-group">
            <label for="templateName">Template Name *</label>
            <input type="text" id="templateName" required placeholder="e.g., Standard Monthly Template">
          </div>
          <div class="form-group">
            <label for="templateDescription">Description</label>
            <textarea id="templateDescription" rows="2" placeholder="Brief description of this template"></textarea>
          </div>

          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid var(--border);">
            <h3 style="margin-bottom: 15px;">📂 Select Categories</h3>
            <p style="color: #666; margin-bottom: 15px;">Choose which categories and subcategories to include in this template:</p>
            <div id="categoriesSelection" style="max-height: 400px; overflow-y: auto; border: 1px solid var(--border); border-radius: 6px; padding: 15px; background: var(--bg-secondary);">
              Loading categories...
            </div>
          </div>

          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid var(--border);">
            <h3 style="margin-bottom: 15px;">🎯 Assign to Budget Type</h3>
            <div class="form-group">
              <label for="assignBudgetType">Budget Type (Optional)</label>
              <select id="assignBudgetType">
                <option value="">-- No assignment --</option>
              </select>
              <small style="color: #666; display: block; margin-top: 5px;">
                Assign this template to a budget type so new budgets of that type automatically use these categories.
              </small>
            </div>
          </div>

          <div class="form-actions">
            <button type="button" class="secondary" onclick="window.closeTemplateModal()">Cancel</button>
            <button type="submit" class="primary">Save Template</button>
            <button type="button" id="deleteTemplateBtn" class="danger" style="display: none;">Delete</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

export async function initBudgetTemplatesPage() {
  const role = String(state.user?.role || '').toLowerCase();
  const isOrgAdmin = ['admin', 'caoh', 'oh', 'ceo', 'fih'].includes(role);
  const hasFinanceSetupRole = state.appRoleAssignments?.some(ar => ar.app_code === 'finance_setup');
  const canEdit = isOrgAdmin || hasFinanceSetupRole;

  const addBtn = document.getElementById('addTemplateBtn');
  if (addBtn && canEdit) {
    addBtn.style.display = 'inline-block';
  }

  window.openTemplateModal = openTemplateModal;
  window.closeTemplateModal = closeTemplateModal;
  window.saveTemplate = saveTemplate;

  // Load all required data
  await Promise.all([
    loadTemplates(),
    loadCategories(),
    loadBudgetTypes()
  ]);
  await loadAssignments();

  renderTemplatesList();
}

async function loadTemplates() {
  try {
    const { data, error } = await supabaseClient
      .from('budget_type_templates')
      .select('*')
      .eq('team_id', state.currentTeam.team_id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });

    if (error && !error.message.includes('does not exist')) {
      throw error;
    }
    templatesList = data || [];
  } catch (err) {
    console.error('Failed to load templates:', err);
    templatesList = [];
  }
}

async function loadCategories() {
  try {
    const { data: cats, error: catErr } = await supabaseClient
      .from('category_master')
      .select('id, name, is_mandatory, sort_order')
      .eq('is_deleted', false)
      .order('sort_order');
    if (catErr) throw catErr;

    const { data: subs, error: subErr } = await supabaseClient
      .from('subcategory_master')
      .select('id, category_master_id, name, is_mandatory, sort_order')
      .eq('is_deleted', false)
      .order('sort_order');
    if (subErr) throw subErr;

    categoriesList = (cats || []).map(c => ({
      key: `cat-${c.id}`,
      name: c.name,
      is_mandatory: c.is_mandatory,
      subcategories: (subs || [])
        .filter(s => s.category_master_id === c.id)
        .map(s => ({ key: `sub-${s.id}`, name: s.name, is_mandatory: s.is_mandatory }))
    }));
  } catch (err) {
    console.error('Failed to load categories:', err);
    categoriesList = [];
  }
}

async function loadBudgetTypes() {
  try {
    const { data, error } = await supabaseClient
      .from('budget_types')
      .select('*')
      .eq('team_id', state.currentTeam.team_id)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error && !error.message.includes('does not exist')) {
      throw error;
    }
    allBudgetTypes = data || [];
  } catch (err) {
    console.error('Failed to load budget types:', err);
    allBudgetTypes = [];
  }
}

async function loadAssignments() {
  try {
    const { data, error } = await supabaseClient
      .from('budget_type_template_assignments')
      .select('template_id, budget_type_id')
      .eq('team_id', state.currentTeam.team_id)
      .eq('is_deleted', false);

    if (error && !error.message.includes('does not exist')) {
      throw error;
    }
    assignmentsList = data || [];
  } catch (err) {
    console.error('Failed to load assignments:', err);
    assignmentsList = [];
  }
}

function renderTemplatesList() {
  const listDiv = document.getElementById('templatesList');
  if (!listDiv) return;

  if (templatesList.length === 0) {
    listDiv.innerHTML = `
      <div class="empty-state">
        <p>📭 No templates created yet.</p>
        <p style="color: #666; font-size: 0.9em;">Create a template to define which categories should be available for specific budget types.</p>
      </div>
    `;
    return;
  }

  const role = String(state.user?.role || '').toLowerCase();
  const isOrgAdmin = ['admin', 'caoh', 'oh', 'ceo', 'fih'].includes(role);
  const hasFinanceSetupRole = state.appRoleAssignments?.some(ar => ar.app_code === 'finance_setup');
  const canEdit = isOrgAdmin || hasFinanceSetupRole;

  const html = `
    <div style="display: grid; gap: 15px;">
      ${templatesList.map(template => {
        const assignment = getAssignmentForTemplate(template.id);
        const categoryCount = parseTemplateData(template.template_data).length;
        return `
          <div style="
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 15px;
            background: rgba(255,255,255,0.5);
            transition: all 0.2s;
          ">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
              <div>
                <h3 style="margin: 0 0 5px 0; color: var(--text-primary);">${escapeHtml(template.name)}</h3>
                ${template.description ? `<p style="margin: 0; color: #666; font-size: 0.9em;">${escapeHtml(template.description)}</p>` : ''}
              </div>
              ${canEdit ? `
                <button class="sq-btn small" onclick="window.openTemplateModal(${template.id})" title="Edit">
                  ✏️
                </button>
              ` : ''}
            </div>

            <div style="margin: 12px 0; padding: 10px; background: rgba(59,130,246,0.1); border-radius: 4px;">
              <strong>Categories:</strong> ${categoryCount} item(s)
            </div>

            <div style="margin: 12px 0; padding: 10px; background: rgba(139,92,246,0.1); border-radius: 4px;">
              ${assignment ? `
                <strong>Assigned to:</strong> ${escapeHtml(assignment.budget_type_label)}
              ` : `
                <strong>Not assigned</strong> to any budget type
              `}
            </div>

            ${template.updated_by ? `
              <div style="font-size: 0.85em; color: #666; margin-top: 10px;">
                Last modified: ${formatDate(template.updated_at)}
              </div>
            ` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;

  listDiv.innerHTML = html;
}

function getAssignmentForTemplate(templateId) {
  const assignment = assignmentsList.find(a => a.template_id === templateId);
  if (!assignment) return null;
  const budgetType = allBudgetTypes.find(bt => bt.id === assignment.budget_type_id);
  return {
    budget_type_id: assignment.budget_type_id,
    budget_type_label: budgetType?.label || 'Unknown'
  };
}

async function openTemplateModal(templateId = null) {
  const modal = document.getElementById('editTemplateModal');
  if (!modal) return;

  const form = document.getElementById('templateForm');
  const modalTitle = document.getElementById('modalTitle');
  const deleteBtn = document.getElementById('deleteTemplateBtn');
  const budgetTypeSelect = document.getElementById('assignBudgetType');

  if (templateId) {
    const template = templatesList.find(t => t.id === templateId);
    if (!template) return;

    modalTitle.textContent = 'Edit Budget Template';
    document.getElementById('templateName').value = template.name || '';
    document.getElementById('templateDescription').value = template.description || '';
    deleteBtn.style.display = 'inline-block';
    deleteBtn.onclick = () => deleteTemplate(templateId);

    form.dataset.templateId = templateId;

    // Load current assignments
    const selectedCategories = parseTemplateData(template.template_data);
    renderCategorySelection(selectedCategories);

    // Set assigned budget type
    loadAssignmentForTemplate(templateId).then(assignment => {
      if (assignment) {
        budgetTypeSelect.value = assignment.budget_type_id;
      } else {
        budgetTypeSelect.value = '';
      }
    });
  } else {
    modalTitle.textContent = 'Create Budget Template';
    form.reset();
    deleteBtn.style.display = 'none';
    delete form.dataset.templateId;
    renderCategorySelection([]);
    budgetTypeSelect.value = '';
  }

  // Populate budget type dropdown
  budgetTypeSelect.innerHTML = '<option value="">-- No assignment --</option>';
  allBudgetTypes.forEach(bt => {
    budgetTypeSelect.innerHTML += `<option value="${bt.id}">${escapeHtml(bt.label)}</option>`;
  });

  modal.classList.add('active');
}

function closeTemplateModal() {
  const modal = document.getElementById('editTemplateModal');
  if (modal) modal.classList.remove('active');
}

function renderCategorySelection(selectedIds = []) {
  const container = document.getElementById('categoriesSelection');
  if (!container) return;

  if (categoriesList.length === 0) {
    container.innerHTML = '<p style="color: #999;">No categories available. Create categories first.</p>';
    return;
  }

  const mainCategories = categoriesList;

  const isSelected = (category, subcategory) => selectedIds.some(sel =>
    sel.category === category && (sel.subcategory || null) === (subcategory || null)
  );

  const html = `
    <div>
      ${mainCategories.map(main => {
        const mainChecked = isSelected(main.name, null);
        return `
          <div style="margin-bottom: 15px;">
            <div style="display: flex; align-items: center; gap: 8px; padding: 8px; background: rgba(0,0,0,0.03); border-radius: 4px;">
              <input type="checkbox" id="${main.key}" class="category-checkbox" data-category="${escapeHtml(main.name)}" ${mainChecked ? 'checked' : ''}>
              <label for="${main.key}" style="margin: 0; cursor: pointer; font-weight: 500; flex: 1;">
                ${escapeHtml(main.name)}
              </label>
            </div>
            ${main.subcategories.length > 0 ? `
              <div style="margin-left: 25px; margin-top: 8px;">
                ${main.subcategories.map(sub => `
                  <div style="display: flex; align-items: center; gap: 8px; padding: 6px 8px; margin-bottom: 4px;">
                    <input type="checkbox" id="${sub.key}" class="category-checkbox" data-category="${escapeHtml(main.name)}" data-subcategory="${escapeHtml(sub.name)}" ${isSelected(main.name, sub.name) ? 'checked' : ''}>
                    <label for="${sub.key}" style="margin: 0; cursor: pointer; font-size: 0.9em; flex: 1;">
                      ${escapeHtml(sub.name)}
                    </label>
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;

  container.innerHTML = html;
}

async function saveTemplate(event) {
  event.preventDefault();

  const name = document.getElementById('templateName').value.trim();
  const description = document.getElementById('templateDescription').value.trim();
  const budgetTypeId = document.getElementById('assignBudgetType').value || null;

  if (!name) {
    showToast('Template name is required', 'warning');
    return;
  }

  // Collect selected categories in the {category, subcategory, is_mandatory} format
  // consumed by loadBudgetCategoryLinesForType() when auto-populating new budgets
  const selectedCategories = Array.from(document.querySelectorAll('.category-checkbox:checked'))
    .map(cb => ({
      category: cb.dataset.category,
      subcategory: cb.dataset.subcategory || null,
      is_mandatory: true
    }));

  if (selectedCategories.length === 0) {
    showToast('Select at least one category for the template', 'warning');
    return;
  }

  const form = event.target;
  const templateId = form.dataset.templateId ? parseInt(form.dataset.templateId) : null;

  try {
    const payload = {
      team_id: state.currentTeam.team_id,
      name,
      description,
      template_data: JSON.stringify(selectedCategories),
      is_deleted: false,
      updated_at: new Date().toISOString(),
      updated_by: state.user.id
    };

    let savedTemplateId = templateId;

    if (templateId) {
      const { error } = await supabaseClient
        .from('budget_type_templates')
        .update(payload)
        .eq('id', templateId);

      if (error) throw error;
      showToast('Template updated successfully', 'success');
    } else {
      const { data, error } = await supabaseClient
        .from('budget_type_templates')
        .insert([{
          ...payload,
          created_at: new Date().toISOString(),
          created_by: state.user.id
        }])
        .select('id')
        .single();

      if (error) throw error;
      savedTemplateId = data.id;
      showToast('Template created successfully', 'success');
    }

    // Handle assignment if selected
    if (budgetTypeId) {
      await assignTemplateToType(savedTemplateId, budgetTypeId);
    }

    closeTemplateModal();
    await loadTemplates();
    await loadAssignments();
    renderTemplatesList();
  } catch (err) {
    console.error('Error saving template:', err);
    showToast(err.message || 'Failed to save template', 'error');
  }
}

async function assignTemplateToType(templateId, budgetTypeId) {
  try {
    if (!templateId) return;

    // First, soft-delete any existing assignment for this budget type
    await supabaseClient
      .from('budget_type_template_assignments')
      .update({ is_deleted: true })
      .eq('budget_type_id', budgetTypeId)
      .eq('is_deleted', false);

    // Create new assignment
    await supabaseClient
      .from('budget_type_template_assignments')
      .insert([{
        budget_type_id: budgetTypeId,
        template_id: templateId,
        team_id: state.currentTeam.team_id,
        is_deleted: false,
        created_at: new Date().toISOString(),
        created_by: state.user.id
      }]);
  } catch (err) {
    console.warn('Failed to assign template:', err);
    // Don't fail the whole operation
  }
}

async function deleteTemplate(templateId) {
  const ok = await showConfirm('Delete this template? This cannot be undone.');
  if (!ok) return;

  try {
    // Soft delete the template
    const { error } = await supabaseClient
      .from('budget_type_templates')
      .update({ is_deleted: true })
      .eq('id', templateId);

    if (error) throw error;

    showToast('Template deleted', 'success');
    closeTemplateModal();
    await loadTemplates();
    renderTemplatesList();
  } catch (err) {
    console.error('Error deleting template:', err);
    showToast(err.message || 'Failed to delete template', 'error');
  }
}

async function loadAssignmentForTemplate(templateId) {
  try {
    const { data, error } = await supabaseClient
      .from('budget_type_template_assignments')
      .select('budget_type_id')
      .eq('template_id', templateId)
      .eq('is_deleted', false)
      .single();

    if (error && error.code === 'PGRST116') {
      return null; // No assignment
    }
    if (error) throw error;

    if (data) {
      const budgetType = allBudgetTypes.find(bt => bt.id === data.budget_type_id);
      return {
        budget_type_id: data.budget_type_id,
        budget_type_label: budgetType?.label || 'Unknown'
      };
    }
    return null;
  } catch (err) {
    console.warn('Failed to load assignment:', err);
    return null;
  }
}

function parseTemplateData(data) {
  if (!data) return [];
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch (e) {
      return [];
    }
  }
  return Array.isArray(data) ? data : [];
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
