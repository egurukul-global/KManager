// ==================== BUDGET TYPE DEFINITIONS ====================

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

export function isMonthlyBudgetType(type) {
  return type === 'monthly';
}

export function isNamedBudgetType(type) {
  return !!type && !isMonthlyBudgetType(type);
}

export function getBudgetTypeConfig(type) {
  if (TYPE_BY_VALUE[type]) return TYPE_BY_VALUE[type];
  if (type === 'adhoc') return TYPE_BY_VALUE.adhoc;
  return TYPE_BY_VALUE.adhoc;
}

export function getBudgetTypeLabel(type) {
  return getBudgetTypeConfig(type).label;
}

export function buildBudgetTypeOptionsHtml(selected = 'monthly') {
  return BUDGET_TYPES.map(t => {
    const sel = t.value === selected ? ' selected' : '';
    return `<option value="${t.value}"${sel}>${t.label}</option>`;
  }).join('');
}
