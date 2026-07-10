// ==================== EXCHANGE RATE UTILITIES ====================
// Convention: rates are always stored and interpreted as "1 USD = X local currency"
// e.g. 1 USD = 95.4 INR, 1 USD = 3.76 AED

export const SUPPORTED_CURRENCIES = ['USD', 'XOF', 'AED', 'INR', 'EUR', 'GBP'];
export const LOCAL_CURRENCIES = SUPPORTED_CURRENCIES.filter(c => c !== 'USD');

/** Currencies where 1 USD equals many local units — stored rate should be >> 1. */
const HIGH_MULTIPLIER_CURRENCIES = new Set(['INR', 'XOF', 'AED']);

/**
 * Normalize any DB rate row to "1 USD = X local" (usd_multiplier).
 * Handles:
 *   - Standard: from=USD, to=INR, rate=95.4
 *   - Legacy local→USD: from=INR, to=USD, rate=0.0105
 *   - Mis-entered legacy: from=AED, to=USD, rate=3.76 (meant 1 USD = 3.76 AED)
 */
function toUsdMultiplier(fromCurrency, toCurrency, rawRate) {
  const rate = parseFloat(rawRate);
  if (!rate || rate <= 0) return null;

  if (fromCurrency === 'USD' && toCurrency && toCurrency !== 'USD') {
    if (HIGH_MULTIPLIER_CURRENCIES.has(toCurrency) && rate < 1) return 1 / rate;
    return rate;
  }

  if (toCurrency === 'USD' && fromCurrency && fromCurrency !== 'USD') {
    if (HIGH_MULTIPLIER_CURRENCIES.has(fromCurrency)) {
      // rate > 1 in legacy fields = user entered USD-multiplier in wrong columns
      if (rate > 1) return rate;
      // rate < 1 = correct legacy "1 local = X USD" → multiplier = 1/X
      return 1 / rate;
    }
    return 1 / rate;
  }

  return null;
}

/**
 * Normalize a DB rate record to USD-multiplier form.
 * Handles legacy records stored as local→USD (e.g. 1 INR = 0.01048 USD).
 */
export function normalizeRateRecord(record) {
  if (!record || record.is_deleted) return null;

  const rate = parseFloat(record.rate);
  if (!rate || rate <= 0) return null;

  const multiplier = toUsdMultiplier(record.from_currency, record.to_currency, rate);
  if (multiplier === null) return null;

  const currency = record.from_currency === 'USD' ? record.to_currency : record.from_currency;
  const legacy = record.to_currency === 'USD';

  return {
    currency,
    rate: multiplier,
    date: record.date,
    id: record.id,
    legacy
  };
}

/** Build a map of currency → latest normalized rate (most recent date wins). */
export function buildLatestRateMap(rates) {
  const map = new Map();

  for (const record of rates || []) {
    const normalized = normalizeRateRecord(record);
    if (!normalized) continue;

    const existing = map.get(normalized.currency);
    if (!existing || new Date(normalized.date) > new Date(existing.date)) {
      map.set(normalized.currency, normalized);
    }
  }

  return map;
}

/** Get the latest USD→local rate for a currency. Returns null if not found. */
export function getLatestUsdRate(rates, currency) {
  if (!currency || currency === 'USD') return 1;
  const map = buildLatestRateMap(rates);
  const entry = map.get(currency);
  return entry ? entry.rate : null;
}

/** Local currencies that have at least one rate defined. */
export function getLocalCurrenciesFromRates(rates) {
  const map = buildLatestRateMap(rates);
  return [...map.keys()].sort();
}

/** USD → local: multiply */
export function usdToLocal(usdAmount, rate) {
  if (!usdAmount || !rate) return 0;
  return usdAmount * rate;
}

/** local → USD: divide */
export function localToUsd(localAmount, rate) {
  if (!localAmount || !rate) return 0;
  return localAmount / rate;
}

/**
 * Find the USD-multiplier rate to use between two currencies (for transfers).
 * Rate always means "1 USD = X local"; conversion logic is applied by caller.
 */
export function findTransferRate(rates, fromCurrency, toCurrency) {
  if (!fromCurrency || !toCurrency || fromCurrency === toCurrency) return 1;

  if (fromCurrency === 'USD') {
    return getLatestUsdRate(rates, toCurrency);
  }

  if (toCurrency === 'USD') {
    return getLatestUsdRate(rates, fromCurrency);
  }

  return null;
}

function formatRateNumber(n) {
  const maxDecimals = n >= 100 ? 2 : 4;
  return String(parseFloat(n.toFixed(maxDecimals)));
}

/** Human-readable rate for labels, tables, and toasts — no trailing zero padding. */
export function formatRate(rate) {
  const n = parseFloat(rate);
  if (!n || Number.isNaN(n)) return '—';
  return formatRateNumber(n);
}

/** Normalize a stored rate value to USD-multiplier form (handles legacy inverse rates). */
export function normalizeUsdMultiplierRate(rate, currency) {
  if (!currency || currency === 'USD') return 1;
  const r = parseFloat(rate);
  if (!r || r <= 0) return 1;
  if (r < 1) return 1 / r;
  return r;
}

/** Format a rate for form inputs — same as formatRate but returns empty string for invalid. */
export function rateForInput(rate) {
  const n = parseFloat(rate);
  if (!n || Number.isNaN(n)) return '';
  return formatRateNumber(n);
}

/** Round USD amounts for display and comparison. */
export function roundUsd(amount) {
  return Math.round((parseFloat(amount) || 0) * 100) / 100;
}

/**
 * Convert an amount in any currency to USD using the latest team exchange rate.
 * Returns null when a non-USD currency has no rate defined.
 */
export function convertToUsd(amount, currency, rates) {
  const n = parseFloat(amount) || 0;
  const cur = String(currency || '').trim();
  if (!cur) return null;
  if (cur === 'USD') return roundUsd(n);

  const rate = getLatestUsdRate(rates, cur);
  if (rate === null || rate <= 0) return null;

  return roundUsd(localToUsd(n, rate));
}

/**
 * Sum amounts in mixed currencies — each line converted to USD first.
 * Buckets without currency or exchange rate are excluded (not treated as USD).
 * @returns {{ totalUsd: number, missingRates: string[], missingCurrency: string[], breakdown: string[] }}
 */
export function sumToUsd(items, rates, getAmount = (i) => i.amount, getCurrency = (i) => i.currency, getLabel = () => null) {
  let totalUsd = 0;
  const missingRates = new Set();
  const missingCurrency = [];
  const breakdown = [];

  for (const item of items || []) {
    const label = getLabel(item);
    const currency = String(getCurrency(item) || '').trim();
    const amount = parseFloat(getAmount(item)) || 0;

    if (!currency) {
      if (label) missingCurrency.push(label);
      if (label) breakdown.push(`${label}: currency not set — excluded`);
      continue;
    }

    const usd = convertToUsd(amount, currency, rates);
    if (usd === null) {
      missingRates.add(currency);
      if (label) breakdown.push(`${label}: no ${currency} rate — excluded`);
      continue;
    }

    totalUsd += usd;
    if (label) {
      if (currency === 'USD') {
        breakdown.push(`${label}: $${formatUsdDisplay(usd)}`);
      } else {
        breakdown.push(`${label}: $${formatUsdDisplay(usd)} (${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency})`);
      }
    }
  }

  return {
    totalUsd: roundUsd(totalUsd),
    missingRates: [...missingRates],
    missingCurrency,
    breakdown
  };
}

/** Sum bucket balances (each in its own currency) to a USD total. */
export function sumBucketBalancesToUsd(buckets, rates) {
  return sumToUsd(
    buckets,
    rates,
    (b) => b.balance,
    (b) => b.currency,
    (b) => b.name || 'Bucket'
  );
}

/** Primary = bucket currency (large); secondary = USD equivalent (small). */
export function formatBucketBalanceDisplay(balance, currency, rates) {
  const n = parseFloat(balance) || 0;
  const formatted = n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cur = String(currency || '').trim();

  if (!cur) {
    return {
      primary: formatted,
      suffix: '',
      usdLine: 'Currency not set — USD equiv. unavailable'
    };
  }

  if (cur === 'USD') {
    return {
      primary: formatted,
      suffix: ' USD',
      usdLine: null
    };
  }

  const usd = convertToUsd(n, cur, rates);
  return {
    primary: formatted,
    suffix: ` ${cur}`,
    usdLine: usd !== null
      ? `≈ $${usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`
      : 'USD rate unavailable'
  };
}

export const ALLOCATION_TOLERANCE = 0.01;

export function allocationsExceedIncome(totalAllocated, amountUsd) {
  return roundUsd(totalAllocated) - roundUsd(amountUsd) > ALLOCATION_TOLERANCE;
}

export function formatUsdDisplay(amount) {
  const rounded = roundUsd(amount);
  return rounded.toFixed(2);
}

export function rateDisplayLabel(currency, rate) {
  if (currency === 'USD') return '1 USD = 1 USD';
  return `1 USD = ${formatRate(rate)} ${currency}`;
}

/** Compute local amount from USD using USD-multiplier rate. */
export function calcLocalFromUsd(usdAmount, currency, rate) {
  if (currency === 'USD') return usdAmount;
  return usdToLocal(usdAmount, rate);
}

/** Compute USD amount from a bucket-currency amount using USD-multiplier rate. */
export function calcUsdFromBucketAmount(bucketAmount, currency, rate) {
  if (currency === 'USD') return bucketAmount;
  return localToUsd(bucketAmount, rate);
}

/** For income/transfer: derive stored fields from bucket-currency entry. */
export function splitIncomeAmounts(bucketAmount, currency, rate) {
  if (currency === 'USD') {
    return { amount_usd: bucketAmount, local_amount: bucketAmount };
  }
  return {
    amount_usd: localToUsd(bucketAmount, rate),
    local_amount: bucketAmount
  };
}

/** Populate edit form: show the amount the user originally entered (bucket currency). */
export function bucketAmountForEdit(rec) {
  const currency = rec.currency || 'USD';
  const amountUsd = parseFloat(rec.amount_usd) || 0;
  const localAmount = parseFloat(rec.local_amount) || 0;

  if (currency === 'USD') return amountUsd;

  // New convention: local_amount = bucket currency, amount_usd = USD equivalent
  if (localAmount > 0 && localAmount >= amountUsd) {
    return localAmount;
  }

  // Legacy: amount_usd incorrectly held the bucket-currency amount
  if (amountUsd > localAmount && amountUsd > 0) {
    return amountUsd;
  }

  const rate = normalizeUsdMultiplierRate(rec.exchange_rate, currency);
  if (amountUsd > 0) {
    return usdToLocal(amountUsd, rate);
  }

  return localAmount;
}
