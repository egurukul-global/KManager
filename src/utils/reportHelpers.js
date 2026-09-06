// ==================== REPORT HELPERS ====================
import { getExpenseCategoryLabel } from './expenseHelpers.js';

export const EXPENSE_ITEM_MAX_LEN = 20;

export const DEFAULT_REPORT_SECTIONS = {
  expenseDetail: true,
  categorySummary: true,
  incomeSummary: true,
  incomeDetail: true,
  budgetAllocations: true,
  financialSummary: true
};

export function truncReportItem(text, maxLen = EXPENSE_ITEM_MAX_LEN) {
  const s = String(text || '').trim();
  if (!s) return '—';
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

export function getReportTeamName(state) {
  return state?.currentTeam?.team_name || 'Current Team';
}

export function buildReportFilterDescription(filters, budget, getBucketName) {
  const parts = [];
  if (filters.start) parts.push(`From: ${filters.start}`);
  if (filters.end) parts.push(`To: ${filters.end}`);
  if (budget) parts.push(`Budget: ${budget.name}`);
  if (filters.category) parts.push(`Category: ${filters.category}`);
  if (filters.sourceId && getBucketName) parts.push(`Source: ${getBucketName(filters.sourceId)}`);
  if (filters.currency) parts.push(`Currency: ${filters.currency}`);
  return parts;
}

/** Scope income rows and totals to report filters (budget-specific when selected). */
export function scopeIncomeForReport(incomeRecords, budgetId) {
  if (!budgetId) {
    return {
      records: incomeRecords,
      summary: computeIncomeSummaryAll(incomeRecords)
    };
  }

  const records = [];
  incomeRecords.forEach(rec => {
    const scopedAllocs = (rec.budget_allocations || []).filter(a => a.budget_id === budgetId);
    if (scopedAllocs.length) {
      records.push({ ...rec, budget_allocations: scopedAllocs });
    }
  });

  return {
    records,
    summary: computeIncomeSummaryForBudget(records)
  };
}

function sumAllocations(rec) {
  return (rec.budget_allocations || []).reduce(
    (sum, a) => sum + (parseFloat(a.amount_usd) || 0),
    0
  );
}

function computeIncomeSummaryAll(records) {
  const totalReceived = records.reduce((sum, r) => sum + (parseFloat(r.amount_usd) || 0), 0);
  const allocated = records.reduce((sum, r) => sum + sumAllocations(r), 0);
  return {
    recordCount: records.length,
    totalReceived,
    allocated,
    unallocated: totalReceived - allocated,
    budgetScoped: false
  };
}

function computeIncomeSummaryForBudget(records) {
  const allocated = records.reduce((sum, r) => sum + sumAllocations(r), 0);
  return {
    recordCount: records.length,
    totalReceived: allocated,
    allocated,
    unallocated: 0,
    budgetScoped: true
  };
}

export function budgetedUsd(budget) {
  return (budget.categories || []).reduce((sum, cat) => {
    return sum + (parseFloat(cat.usdAmount ?? cat.usd_amount) || 0);
  }, 0);
}

export function categoryStatusBadge(budgeted, actual) {
  const balance = budgeted - actual;
  if (balance < 0) return '<span class="badge badge-danger">Over Budget</span>';
  if (actual === 0) return '<span class="badge badge-secondary">No Spend</span>';
  return '<span class="badge badge-success">On Track</span>';
}

/** Aggregate actual spend by expense category label. */
export function aggregateSpendByCategory(filteredExpenses, teamCategories, includeSubcategory = false) {
  const map = new Map();
  
  function getGroupKey(catId, subId, fallbackName) {
    if (!catId) return fallbackName || 'Unknown';
    let resolvedCatName = 'Unknown';
    let resolvedSubName = '';
    if (teamCategories) {
      const matchedCat = teamCategories.find(c => c.id === catId);
      if (matchedCat) {
        resolvedCatName = matchedCat.name;
        if (subId && matchedCat.subcategories) {
          const matchedSub = matchedCat.subcategories.find(s => s.id === subId);
          if (matchedSub) resolvedSubName = matchedSub.name;
        }
      }
    }
    if (includeSubcategory) {
      return resolvedCatName + (resolvedSubName ? ` / ${resolvedSubName}` : '');
    } else {
      return resolvedCatName;
    }
  }

  filteredExpenses.forEach(exp => {
    let label;
    let cId = exp.category_id;
    let sId = exp.subcategory_id;
    
    if (!cId) {
      label = getGroupKey(null, null, exp.vendor_info || 'Unknown');
    } else {
      label = getGroupKey(cId, sId, exp.vendor_info);
    }
    
    const prev = map.get(label) || { actual: 0, count: 0 };
    prev.actual += parseFloat(exp.usd_amount) || 0;
    prev.count += 1;
    map.set(label, prev);
  });
  return [...map.entries()]
    .sort((a, b) => b[1].actual - a[1].actual)
    .map(([category, data]) => ({ category, ...data }));
}
