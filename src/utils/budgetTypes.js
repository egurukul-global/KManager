// ==================== BUDGET TYPE DEFINITIONS ====================
import { state } from '../state.js';
import { supabaseClient } from '../db.js';

/** Org-wide monthly budgets use the calendar label; all other types use a team-specific name. */
export const BUDGET_TYPES = [
  {
    value: 'monthly',
    label: 'Monthly',
    usesCalendar: true,
    nameEditable: false,
    nameHint: 'Name is set from the org calendar label so every team uses the same name.',
    namePlaceholder: 'Select a calendar period date'
  },
  {
    value: 'medical',
    label: 'Medical',
    usesCalendar: false,
    nameEditable: true,
    nameHint: 'Enter a descriptive name for this medical budget.',
    namePlaceholder: 'e.g. Surgery fund, Dental treatment'
  },
  {
    value: 'travel',
    label: 'Travel',
    usesCalendar: false,
    nameEditable: true,
    nameHint: 'Enter a descriptive name for this travel budget.',
    namePlaceholder: 'e.g. Dubai trip March 2026'
  },
  {
    value: 'passport-visa',
    label: 'Passport & Visa',
    usesCalendar: false,
    nameEditable: true,
    nameHint: 'Enter a descriptive name for this passport or visa budget.',
    namePlaceholder: 'e.g. Passport renewal — John'
  },
  {
    value: 'legal',
    label: 'Legal',
    usesCalendar: false,
    nameEditable: true,
    nameHint: 'Enter a descriptive name for this legal budget.',
    namePlaceholder: 'e.g. Contract review Q2'
  },
  {
    value: 'dr',
    label: 'DR',
    usesCalendar: false,
    nameEditable: true,
    nameHint: 'Enter a descriptive name for this DR budget.',
    namePlaceholder: 'e.g. DR filing 2026'
  },
  {
    value: 'adhoc',
    label: 'Adhoc',
    usesCalendar: false,
    nameEditable: true,
    nameHint: 'Enter a descriptive name for this one-off budget.',
    namePlaceholder: 'e.g. Special event, Equipment purchase'
  },
  {
    value: 'emergency',
    label: 'Emergency',
    usesCalendar: false,
    nameEditable: true,
    nameHint: 'Enter a descriptive name for this emergency budget.',
    namePlaceholder: 'e.g. Urgent repairs'
  },
  {
    value: 'shipping',
    label: 'Shipping',
    usesCalendar: false,
    nameEditable: true,
    nameHint: 'Enter a descriptive name for this shipping budget.',
    namePlaceholder: 'e.g. Freight to Mumbai'
  }
];

const TYPE_BY_VALUE = Object.fromEntries(BUDGET_TYPES.map(t => [t.value, t]));

/**
 * Load the org-global budget types from the `budget_types` table.
 * Falls back to the built-in BUDGET_TYPES const when the table is missing.
 * Populates `state.budgetTypes` with rows shaped like the built-in config
 * ({ value, label, name, usesCalendar, nameEditable }).
 */
let budgetTypesLoadPromise = null;

export async function loadBudgetTypes() {
  if (budgetTypesLoadPromise) return budgetTypesLoadPromise;
  budgetTypesLoadPromise = (async () => {
    try {
      const { data, error } = await supabaseClient
        .from('budget_types')
        .select('id, code, name, label, description, is_active')
        .eq('is_deleted', false)
        .eq('is_active', true)
        .order('id', { ascending: true });

      if (error) throw error;

      const list = (data || []).map(bt => {
        const value = bt.code || bt.name || bt.label;
        const isMonthly = value === 'monthly';
        return {
          id: bt.id,
          value,
          label: bt.label || bt.name || value,
          name: bt.name || value,
          usesCalendar: isMonthly,
          nameEditable: !isMonthly
        };
      });

      // DB is the single source of truth for the dropdown; keep the list even
      // if empty (no hardcoded fallback).
      state.budgetTypes = list;
      return state.budgetTypes;
    } catch (err) {
      console.debug('budget_types not available, using built-in types:', err?.message);
      state.budgetTypes = null;
      budgetTypesLoadPromise = null; // allow retry later (e.g. after reconnect)
      return null;
    }
  })();
  return budgetTypesLoadPromise;
}

/** Reset cache (e.g. after admin adds/edits types so the create form refreshes). */
export function resetBudgetTypesCache() {
  budgetTypesLoadPromise = null;
  state.budgetTypes = null;
}

export function isMonthlyBudgetType(type) {
  return type === 'monthly';
}

export function isNamedBudgetType(type) {
  return !!type && !isMonthlyBudgetType(type);
}

export function getBudgetTypeConfig(type) {
  if (TYPE_BY_VALUE[type]) return TYPE_BY_VALUE[type];

  // Budget type defined in the DB (not one of the built-ins)
  const dbType = (state.budgetTypes || []).find(t => t.value === type);
  if (dbType) {
    return {
      value: dbType.value,
      label: dbType.label || dbType.name || type,
      usesCalendar: false,
      nameEditable: true,
      nameHint: `${dbType.label || dbType.name} budgets use a custom name and period date for your team.`,
      namePlaceholder: `e.g. ${dbType.label || dbType.name} budget`
    };
  }

  if (type === 'adhoc') return TYPE_BY_VALUE.adhoc;
  return TYPE_BY_VALUE.adhoc;
}

export function getBudgetTypeLabel(type) {
  return getBudgetTypeConfig(type).label;
}

export function buildBudgetTypeOptionsHtml(selected = 'monthly') {
  // Budget types come ONLY from the DB (state.budgetTypes, loaded from the
  // budget_types table). No hardcoded fallback in the dropdown.
  const list = state.budgetTypes || [];
  return list.map(t => {
    const value = t.value ?? t.code;
    const sel = value === selected ? ' selected' : '';
    return `<option value="${value}"${sel}>${t.label}</option>`;
  }).join('');
}
