import { supabaseClient } from '../db.js';
import { DEFAULT_CATEGORY_MASTER, flattenCategoryMaster } from '../data/defaultCategoryMaster.js';

/** Load org category master from Supabase; fallback to defaults if table missing */
export async function loadCategoryMaster() {
  try {
    const { data: categories, error: catErr } = await supabaseClient
      .from('category_master')
      .select('id, name, sort_order, is_mandatory, is_active')
      .eq('is_deleted', false)
      .eq('is_active', true)
      .order('sort_order');

    if (catErr) throw catErr;

    const { data: subs, error: subErr } = await supabaseClient
      .from('subcategory_master')
      .select('id, category_master_id, name, sort_order, is_mandatory, is_active')
      .eq('is_deleted', false)
      .eq('is_active', true)
      .order('sort_order');

    if (subErr) throw subErr;

    if (!categories?.length) {
      return DEFAULT_CATEGORY_MASTER;
    }

    return categories.map(cat => ({
      id: cat.id,
      name: cat.name,
      sort_order: cat.sort_order,
      is_mandatory: cat.is_mandatory,
      subcategories: (subs || [])
        .filter(s => s.category_master_id === cat.id)
        .map(s => ({ id: s.id, name: s.name, is_mandatory: s.is_mandatory }))
    }));
  } catch (e) {
    console.warn('category_master not available, using defaults:', e.message);
    return DEFAULT_CATEGORY_MASTER;
  }
}

export async function loadCategoryMasterLines() {
  const master = await loadCategoryMaster();
  return flattenCategoryMaster(master);
}

export function formatCategoryLabel(category, subcategory) {
  if (subcategory) return `${category} → ${subcategory}`;
  return category;
}

export function categoryDisplayName(line) {
  if (line.subcategory) return `${line.category} — ${line.subcategory}`;
  return line.category || line.name || '';
}

/** Normalize stored budget category row for display and template matching */
export function normalizeBudgetCategory(cat) {
  let category = cat.category || '';
  let subcategory = cat.subcategory ?? null;
  const rawName = cat.name || '';

  if (!category) {
    if (rawName.includes(' → ')) {
      [category, subcategory] = rawName.split(' → ').map(s => s.trim());
    } else if (rawName.includes(' — ')) {
      [category, subcategory] = rawName.split(' — ').map(s => s.trim());
    } else {
      category = rawName;
    }
  }

  return {
    ...cat,
    category,
    subcategory: subcategory || null,
    name: categoryDisplayName({ category, subcategory, name: rawName })
  };
}
