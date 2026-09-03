// ==================== BUDGET TYPE TEMPLATES ====================
import { supabaseClient } from '../db.js';

/**
 * Load the active template assignment for a given budget type.
 * Returns the template object or null if none assigned or tables don't exist.
 */
export async function loadTemplateForBudgetType(budgetType) {
  if (!budgetType) return null;

  try {
    // Find the active (non-deleted) assignment for this budget type
    const { data: assignments, error: assignErr } = await supabaseClient
      .from('budget_type_template_assignments')
      .select('template_id')
      .eq('budget_type', budgetType)
      .eq('is_deleted', false)
      .maybeSingle();

    if (assignErr) {
      // Table might not exist yet
      console.debug('Template assignment query failed:', assignErr.message);
      return null;
    }

    if (!assignments) return null;

    // Load the template details
    const { data: template, error: templateErr } = await supabaseClient
      .from('budget_type_templates')
      .select('id, name, description, template_data, is_deleted')
      .eq('id', assignments.template_id)
      .eq('is_deleted', false)
      .maybeSingle();

    if (templateErr) {
      console.debug('Template fetch failed:', templateErr.message);
      return null;
    }

    return template;
  } catch (err) {
    console.debug('loadTemplateForBudgetType error:', err.message);
    return null;
  }
}

/**
 * Convert template data (if stored as JSON) into budget placeholder lines.
 */
export async function loadCategoryMasterLines() {
  // Import here to avoid circular dependency
  const mod = await import('./categoryMaster.js');
  return mod.loadCategoryMasterLines();
}

/**
 * Parse template_data field (assumed to be JSON array of category objects).
 * Each object should have: { category, subcategory, is_mandatory }.
 */
function parseTemplateData(templateData) {
  if (!templateData) return [];
  try {
    if (typeof templateData === 'string') {
      return JSON.parse(templateData);
    }
    if (Array.isArray(templateData)) {
      return templateData;
    }
    return [];
  } catch (err) {
    console.warn('Failed to parse template_data:', err);
    return [];
  }
}

/**
 * Get budget category placeholder lines for a budget type.
 * UNIFORM RULE (applies to every budget type, including monthly):
 * - If a template is assigned to the type, return its stored category lines.
 *   These act as placeholders; users can still add ad hoc line items.
 * - If no template is assigned (or the template has no data), return an
 *   empty array and the budget opens blank for free line-item entry.
 * There is NO monthly special case and NO category master fallback.
 */
export async function loadBudgetCategoryLinesForType(budgetType) {
  const template = await loadTemplateForBudgetType(budgetType);

  if (template && template.template_data) {
    const templateLines = parseTemplateData(template.template_data);
    if (templateLines.length > 0) {
      return templateLines;
    }
  }

  return [];
}

/**
 * Save template data from current budget form categories.
 * Stores the categories array as JSON in the template_data field.
 */
export async function saveTemplateData(templateId, categories) {
  if (!templateId || !Array.isArray(categories)) return;

  try {
    const templateData = categories.map(cat => ({
      category: cat.category || '',
      subcategory: cat.subcategory || '',
      is_mandatory: cat.is_mandatory !== false
    }));

    const { error } = await supabaseClient
      .from('budget_type_templates')
      .update({
        template_data: JSON.stringify(templateData),
        updated_at: new Date().toISOString()
      })
      .eq('id', templateId);

    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Failed to save template data:', err);
    return false;
  }
}
