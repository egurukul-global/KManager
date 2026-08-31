import {
  calcUsdFromBucketAmount,
  convertToUsd,
  formatRate,
  getLatestUsdRate,
  normalizeRateRecord,
  normalizeUsdMultiplierRate,
  rateDisplayLabel,
  roundUsd
} from './currency.js';
import { categoryDisplayName, normalizeBudgetCategory } from './categoryMaster.js';
import { EXPENSE_ITEM_MAX_LEN } from './reportHelpers.js';

/** Budget category line → select option metadata */
export function getBudgetCategoryOptions(budget, teamCategories = []) {
  const lines = (budget?.categories || []).map(normalizeBudgetCategory);
  return lines.map(line => {
    const label = categoryDisplayName(line);
    const match = teamCategories.find(c =>
      (c.name || '').toLowerCase() === (line.category || '').toLowerCase() || 
      (c.name || '').toLowerCase() === label.toLowerCase()
    );
    return {
      value: match?.id || `line:${line.category}:${line.subcategory || ''}`,
      label,
      categoryId: match?.id || null,
      categoryName: line.category,
      subcategory: line.subcategory,
      budgetedUsd: line.usdAmount || line.usd_amount || 0
    };
  });
}

export function getExpenseCategoryLabel(expense, teamCategories = []) {
  if (expense.category_id) {
    const cat = teamCategories.find(c => c.id === expense.category_id);
    if (cat) return cat.name;
  }
  if (expense.vendor_info?.startsWith('budget_cat:')) {
    return expense.vendor_info.replace('budget_cat:', '');
  }
  return expense.vendor_info || '—';
}

export function buildExpenseRateOptions(rates, currency) {
  if (!currency || currency === 'USD') {
    return [{ value: '1', label: '1 USD = 1 USD', rate: 1 }];
  }

  const seen = new Set();
  const options = [];

  for (const record of rates || []) {
    const normalized = normalizeRateRecord(record);
    if (!normalized || normalized.currency !== currency) continue;
    const key = `${normalized.date}|${normalized.rate}`;
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({
      value: String(normalized.rate),
      label: `${normalized.date} — ${rateDisplayLabel(currency, normalized.rate)}`,
      rate: normalized.rate,
      date: normalized.date
    });
  }

  options.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return options;
}

export function resolveExpenseRate(currency, rateSelectValue, rateManualValue, rates) {
  if (currency === 'USD') return 1;
  const manual = parseFloat(rateManualValue);
  if (manual > 0) return normalizeUsdMultiplierRate(manual, currency);
  const selected = parseFloat(rateSelectValue);
  if (selected > 0) return normalizeUsdMultiplierRate(selected, currency);
  const latest = getLatestUsdRate(rates, currency);
  return latest !== null ? latest : 0;
}

export function calculateExpenseUsd(localAmount, currency, rate) {
  return roundUsd(calcUsdFromBucketAmount(localAmount, currency, rate || 1));
}

export function sumExpensesForBudgetCategory(expenses, budgetId, categoryId, categoryLabel, excludeId = null) {
  return (expenses || [])
    .filter(e => {
      if (e.is_deleted || e.budget_id !== budgetId) return false;
      if (excludeId && e.id === excludeId) return false;
      if (categoryId) return e.category_id === categoryId;
      return getExpenseCategoryLabel(e) === categoryLabel;
    })
    .reduce((sum, e) => sum + (parseFloat(e.usd_amount) || 0), 0);
}

export function checkBudgetOvershoot({ expenses, budget, categoryOption, usdAmount, excludeId }) {
  if (!budget || !categoryOption) return { overshoot: false };

  const budgetedUsd = categoryOption.budgetedUsd || 0;
  const spentUsd = sumExpensesForBudgetCategory(
    expenses,
    budget.id,
    categoryOption.categoryId,
    categoryOption.label,
    excludeId
  );
  const newSpentUsd = spentUsd + usdAmount;

  if (newSpentUsd > budgetedUsd) {
    return {
      overshoot: true,
      budgeted: budgetedUsd,
      spent: spentUsd,
      newSpent: newSpentUsd,
      overBy: newSpentUsd - budgetedUsd,
      category: categoryOption.label,
      budgetName: budget.name
    };
  }
  return { overshoot: false };
}

export function checkBucketOverdrawn(bucket, amountUsd, rates) {
  if (!bucket) return { overdrawn: false };
  const bucketUsd = convertToUsd(bucket.balance, bucket.currency, rates);
  if (bucketUsd === null) return { overdrawn: false, unknown: true };
  if (amountUsd > bucketUsd) {
    return {
      overdrawn: true,
      bucketUsd,
      shortfall: amountUsd - bucketUsd,
      bucketName: bucket.name
    };
  }
  return { overdrawn: false, bucketUsd };
}

export function buildExpensePayload(form, teamId, userId) {
  const val = (name, id) => {
    if (id) {
      const byId = form.querySelector(`#${id}`);
      if (byId) return byId.value ?? '';
    }
    const named = form.elements?.namedItem?.(name);
    if (named && 'value' in named) return named.value ?? '';
    return '';
  };

  const categorySelect = form.elements?.category || form.querySelector('#expCategory') || form.querySelector('#editExpCategory');
  const selected = categorySelect?.selectedOptions?.[0];
  const categoryId = selected?.dataset?.categoryId || null;
  const categoryLabel = selected?.dataset?.label || '';

  const currency = (val('currency', 'expCurrency') || val('currency', 'editExpCurrency') || 'USD').toUpperCase();
  const rate = resolveExpenseRate(
    currency,
    val('rate_select', 'expRateSelect') || val('rate_select', 'editExpRateSelect'),
    val('rate_manual', 'expRateManual') || val('rate_manual', 'editExpRateManual'),
    form._rates || []
  );
  const localAmount = parseFloat(val('local_amount', 'expLocalAmount') || val('local_amount', 'editExpLocalAmount')) || 0;
  const usdAmount = calculateExpenseUsd(localAmount, currency, rate);

  let vendor_info = null;
  if (!categoryId && categoryLabel) {
    vendor_info = `budget_cat:${categoryLabel}`;
  }

  return {
    team_id: teamId,
    date: val('date', 'expDate') || val('date', 'editExpDate'),
    item: (val('item', 'expItem') || val('item', 'editExpItem')).trim().slice(0, EXPENSE_ITEM_MAX_LEN),
    description: (val('description', 'expDescription') || val('description', 'editExpDescription')).trim() || null,
    budget_id: val('budget_id', 'expBudget') || val('budget_id', 'editExpBudget'),
    category_id: categoryId || null,
    bucket_id: val('bucket_id', 'expBucket') || val('bucket_id', 'editExpBucket'),
    local_amount: localAmount,
    currency,
    rate,
    usd_amount: usdAmount,
    total_usd: usdAmount,
    receipt_url: (val('receipt_url', 'expReceiptUrl') || val('receipt_url', 'editExpReceiptUrl')).trim() || null,
    vendor_info,
    is_submitted: form.querySelector('#editExpSubmitReview')?.checked ?? form.querySelector('#expSubmitReview')?.checked ?? false,
    status: 'recorded',
    payment_status: 'paid',
    created_by: userId,
    is_deleted: false,
    updated_at: new Date().toISOString()
  };
}
