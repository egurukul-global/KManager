// ==================== BUDGET CATEGORY LINES ====================
// Single source of truth for flattening a budget's stored `categories`
// array into plain { category, subcategory, usdAmount } lines.
// Handles BOTH storage styles the app has produced over time:
//   1) inline subcategory   : { category:'Food', subcategory:'Groceries', usdAmount: 40 }
//   2) items[] (line items) : { category:'Utilities', subcategory:null, rate:550,
//                               usdAmount: 33.64, items:[{ name:'Gas', total:13000 }, ...] }
//      -> each item becomes a line with usdAmount = item.total / rate
import { normalizeBudgetCategory } from './categoryMaster.js';

function toArray(raw) {
  if (!raw) return [];
  let arr = raw;
  if (typeof arr === 'string') {
    try { arr = JSON.parse(arr); } catch { return []; }
  }
  return Array.isArray(arr) ? arr : [];
}

/**
 * Flatten a budget categories array into budget lines.
 * @returns {Array<{category:string, subcategory:string|null, usdAmount:number}>}
 */
export function flattenBudgetToCategoryLines(rawCategories) {
  const lines = [];
  for (const cat of toArray(rawCategories)) {
    const normalized = normalizeBudgetCategory(cat);
    const category = normalized.category || cat?.name || '';
    const usdFallback = parseFloat(normalized.usdAmount ?? normalized.usd_amount ?? 0) || 0;
    const localFallback = parseFloat(cat?.localAmount ?? cat?.local_amount ?? 0) || 0;
    const currency = cat?.currency || null;
    const rate = parseFloat(cat?.rate ?? cat?.localRate ?? 0) || 0;
    const items = Array.isArray(cat?.items) && cat.items.length > 0 ? cat.items : null;

    if (items) {
      // items[] style -> one line per item
      let itemsUsd = 0;
      for (const item of items) {
        const itemName = typeof item === 'string' ? item : (item?.name || '');
        if (!itemName) continue;
        const itemTotal = parseFloat(typeof item === 'object' && item ? (item.total ?? item.usdAmount ?? 0) : 0) || 0;
        const usdAmount = rate > 0 ? itemTotal / rate : (parseFloat(item?.usdAmount) || 0);
        const safeUsd = Number.isFinite(usdAmount) ? usdAmount : 0;
        itemsUsd += safeUsd;
        lines.push({ category, subcategory: itemName, usdAmount: safeUsd, localAmount: itemTotal, currency, rate });
      }
      // Keep any parent amount not covered by items as the category-level line
      const remainder = Math.round((usdFallback - itemsUsd) * 100) / 100;
      if (remainder > 0.005) {
        lines.push({ category, subcategory: null, usdAmount: remainder, localAmount: 0, currency, rate });
      }
    } else if (normalized.subcategory) {
      // inline subcategory line
      lines.push({ category, subcategory: normalized.subcategory, usdAmount: usdFallback, localAmount: localFallback, currency, rate });
    } else {
      // plain category line (no subcategory)
      lines.push({ category, subcategory: null, usdAmount: usdFallback, localAmount: localFallback, currency, rate });
    }
  }
  return lines;
}

/**
 * Build display rows (parent category + subcategory children) from flat lines.
 * @returns {Array<{category:string, subcategory:string|null, usdAmount:number, isParent:boolean}>}
 */
export function buildBudgetCategoryRows(rawCategories) {
  const lines = flattenBudgetToCategoryLines(rawCategories);
  const groups = new Map(); // category(lower) -> { name, children:[] }
  for (const ln of lines) {
    const key = String(ln.category || '').toLowerCase();
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, { name: ln.category, children: [] });
    groups.get(key).children.push(ln);
  }

  const rows = [];
  for (const [, g] of groups) {
    const children = g.children.filter(c => c.subcategory);
    const parentTotal = g.children.reduce((s, c) => s + c.usdAmount, 0);
    const parentLocal = g.children.reduce((s, c) => s + (c.localAmount || 0), 0);
    const currency = g.children.find(c => c.currency)?.currency || null;
    rows.push({ category: g.name, subcategory: null, usdAmount: parentTotal, localAmount: parentLocal, currency, isParent: true });
    for (const child of children) {
      rows.push({ category: g.name, subcategory: child.subcategory, usdAmount: child.usdAmount, localAmount: child.localAmount || 0, currency: child.currency || null, isParent: false });
    }
  }
  return rows;
}