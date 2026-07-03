// ==================== FINANCIAL STATUS CALCULATIONS ====================
import {
  getLatestUsdRate,
  localToUsd,
  normalizeRateRecord,
  roundUsd
} from './currency.js';

/** USD-multiplier rate on or before a date (falls back to latest). */
export function getRateForDate(rates, currency, asOfDate) {
  if (!currency || currency === 'USD') return 1;

  const normalized = (rates || [])
    .map(normalizeRateRecord)
    .filter(r => r && r.currency === currency && (!asOfDate || r.date <= asOfDate))
    .sort((a, b) => b.date.localeCompare(a.date));

  if (normalized.length > 0) return normalized[0].rate;
  return getLatestUsdRate(rates, currency);
}

function convertToCurrency(amount, fromCurrency, toCurrency, date, rates) {
  const n = parseFloat(amount) || 0;
  if (!fromCurrency || !toCurrency || fromCurrency === toCurrency) return n;

  const fromRate = getRateForDate(rates, fromCurrency, date);
  const toRate = getRateForDate(rates, toCurrency, date);
  if (!fromRate || !toRate) return 0;

  const usd = fromCurrency === 'USD' ? n : localToUsd(n, fromRate);
  return toCurrency === 'USD' ? usd : usd * toRate;
}

export function getTransferDestAmount(transfer, destBucket, rates) {
  const srcCurr = transfer.currency || 'USD';
  const destCurr = destBucket?.currency || 'USD';
  const amount = parseFloat(transfer.amount) || 0;
  const rate = parseFloat(transfer.rate) || 0;

  if (srcCurr === destCurr) return amount;
  if (srcCurr === 'USD') return amount * rate;
  if (destCurr === 'USD') return amount / rate;

  const srcRate = rate > 0 ? rate : getRateForDate(rates, srcCurr, transfer.date);
  const destRate = getRateForDate(rates, destCurr, transfer.date);
  if (!srcRate || !destRate) return 0;
  return (amount / srcRate) * destRate;
}

function sumIncomeForBucket(bucketId, currency, fromDate, toDate, income, rates) {
  let rows = (income || []).filter(f => f.bucket_id === bucketId && !f.is_deleted);
  if (fromDate) rows = rows.filter(f => f.date >= fromDate);
  if (toDate) rows = rows.filter(f => f.date <= toDate);

  return rows.reduce((sum, f) => {
    const amt = parseFloat(f.local_amount ?? f.amount_usd) || 0;
    const cur = f.currency || 'USD';
    return sum + convertToCurrency(amt, cur, currency, f.date, rates);
  }, 0);
}

function sumExpensesForBucket(bucketId, currency, fromDate, toDate, expenses, rates) {
  let rows = (expenses || []).filter(e => e.bucket_id === bucketId && !e.is_deleted);
  if (fromDate) rows = rows.filter(e => e.date >= fromDate);
  if (toDate) rows = rows.filter(e => e.date <= toDate);

  return rows.reduce((sum, e) => {
    const amt = parseFloat(e.local_amount) || 0;
    const cur = e.currency || 'USD';
    return sum + convertToCurrency(amt, cur, currency, e.date, rates);
  }, 0);
}

function sumTransfersIn(bucketId, currency, fromDate, toDate, transfers, bucketsById, rates) {
  let rows = (transfers || []).filter(t => t.to_bucket_id === bucketId && !t.is_deleted);
  if (fromDate) rows = rows.filter(t => t.date >= fromDate);
  if (toDate) rows = rows.filter(t => t.date <= toDate);

  return rows.reduce((sum, t) => {
    const dest = bucketsById.get(t.to_bucket_id);
    const amt = getTransferDestAmount(t, dest, rates);
    const cur = dest?.currency || 'USD';
    return sum + convertToCurrency(amt, cur, currency, t.date, rates);
  }, 0);
}

function sumTransfersOut(bucketId, currency, fromDate, toDate, transfers, bucketsById, rates) {
  let rows = (transfers || []).filter(t => t.from_bucket_id === bucketId && !t.is_deleted);
  if (fromDate) rows = rows.filter(t => t.date >= fromDate);
  if (toDate) rows = rows.filter(t => t.date <= toDate);

  return rows.reduce((sum, t) => {
    const src = bucketsById.get(t.from_bucket_id);
    const amt = parseFloat(t.amount) || 0;
    const cur = t.currency || src?.currency || 'USD';
    return sum + convertToCurrency(amt, cur, currency, t.date, rates);
  }, 0);
}

/** Opening balance before fromDate (uses bucket.balance as baseline). */
export function getBucketOpening(bucket, fromDate, income, expenses, transfers, bucketsById, rates) {
  let balance = parseFloat(bucket.balance) || 0;
  if (!fromDate) return balance;

  const bucketId = bucket.id;
  const currency = bucket.currency || 'USD';

  balance += sumIncomeForBucket(bucketId, currency, null, beforeDay(fromDate), income, rates);
  balance += sumTransfersIn(bucketId, currency, null, beforeDay(fromDate), transfers, bucketsById, rates);
  balance -= sumExpensesForBucket(bucketId, currency, null, beforeDay(fromDate), expenses, rates);
  balance -= sumTransfersOut(bucketId, currency, null, beforeDay(fromDate), transfers, bucketsById, rates);

  return balance;
}

function beforeDay(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

export function computeBucketStatusRow(bucket, fromDate, toDate, income, expenses, transfers, buckets, rates) {
  const bucketsById = new Map((buckets || []).map(b => [b.id, b]));
  const currency = bucket.currency || 'USD';
  const asOfDate = toDate || new Date().toISOString().split('T')[0];

  const opening = getBucketOpening(bucket, fromDate, income, expenses, transfers, bucketsById, rates);
  const incomeAmt = sumIncomeForBucket(bucket.id, currency, fromDate, toDate, income, rates);
  const transfersIn = sumTransfersIn(bucket.id, currency, fromDate, toDate, transfers, bucketsById, rates);
  const expensesAmt = sumExpensesForBucket(bucket.id, currency, fromDate, toDate, expenses, rates);
  const transfersOut = sumTransfersOut(bucket.id, currency, fromDate, toDate, transfers, bucketsById, rates);
  const closing = opening + incomeAmt + transfersIn - expensesAmt - transfersOut;

  const rate = getRateForDate(rates, currency, asOfDate);
  const closingUsd = currency === 'USD' ? closing : (rate ? localToUsd(closing, rate) : null);

  return {
    bucketId: bucket.id,
    bucketName: bucket.name,
    currency,
    opening,
    income: incomeAmt,
    transfersIn,
    expenses: expensesAmt,
    transfersOut,
    closing,
    closingUsd: closingUsd !== null ? roundUsd(closingUsd) : null
  };
}

export function filterBucketsByScope(buckets, scope, userId) {
  const active = (buckets || []).filter(b => !b.is_deleted);
  if (scope === 'all') return active;
  if (scope === 'personal') return active.filter(b => !!b.owner_user_id);
  return active.filter(b => !b.owner_user_id);
}

export function bucketScopeLabel(bucket) {
  return bucket?.owner_user_id ? 'Personal' : 'Team';
}

export function bucketHasMoney(row) {
  return Math.abs(row.closing) >= 0.01;
}

export function formatMoney(amount, currency) {
  const n = parseFloat(amount) || 0;
  return `${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency || ''}`.trim();
}

export function formatDifference(actual, closing, currency) {
  const diff = (parseFloat(actual) || 0) - (parseFloat(closing) || 0);
  const formatted = diff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (Math.abs(diff) < 0.01) {
    return { diff, text: `${formatted} ${currency} ✓`, level: 'positive' };
  }
  if (diff > 0) {
    return { diff, text: `+${formatted} ${currency} (Surplus)`, level: 'positive' };
  }
  return { diff, text: `${formatted} ${currency} (Short)`, level: 'negative' };
}
