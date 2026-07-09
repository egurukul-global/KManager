// Fallback when category_master table is not migrated yet
export const DEFAULT_CATEGORY_MASTER = [
  { name: 'Rent', sort_order: 1, is_mandatory: true, subcategories: [] },
  { name: 'Utilities', sort_order: 2, is_mandatory: true, subcategories: ['Gas', 'Electricity'] },
  { name: 'Food', sort_order: 3, is_mandatory: true, subcategories: ['Groceries', 'Veg-fruits'] },
  { name: 'House Keeping', sort_order: 4, is_mandatory: true, subcategories: [] },
  { name: 'Internet Phone', sort_order: 5, is_mandatory: true, subcategories: ['Phone', 'data'] },
  { name: 'Transport', sort_order: 6, is_mandatory: true, subcategories: [] },
  { name: 'Medical', sort_order: 7, is_mandatory: true, subcategories: [] },
  { name: 'Office supplies', sort_order: 8, is_mandatory: true, subcategories: ['stationery', 'print'] },
  { name: 'Legal & DR', sort_order: 9, is_mandatory: true, subcategories: [] }
];

/** Flatten master into budget line items with default 0 amounts */
export function flattenCategoryMaster(masterRows) {
  const lines = [];

  masterRows.forEach(cat => {
    const subs = cat.subcategories || [];
    if (subs.length === 0) {
      lines.push({
        category: cat.name,
        subcategory: null,
        is_mandatory: cat.is_mandatory !== false,
        usdAmount: 0,
        localAmount: 0,
        currency: 'USD',
        rate: 1
      });
    } else {
      subs.forEach(sub => {
        const subName = typeof sub === 'string' ? sub : sub.name;
        lines.push({
          category: cat.name,
          subcategory: subName,
          is_mandatory: true,
          usdAmount: 0,
          localAmount: 0,
          currency: 'USD',
          rate: 1
        });
      });
    }
  });

  return lines;
}
