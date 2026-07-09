/* ========== TRANSFER FUNDS MODULE ========== */
import { state } from '../state.js';
import { sbInsert, sbSelect, supabaseClient } from '../db.js';
import { showToast } from '../components/toasts.js';
import { rateForInput, getLatestUsdRate, formatRate } from '../utils/currency.js';
import { applyDefaultsToTransferForm, loadUserTeamDefaultsForCurrentTeam } from '../utils/userTeamDefaults.js';

// Module-level cache
let teamBucketsCache = [];
let exchangeRatesCache = [];

// ==========================================
// HELPERS (mirrors income.js pattern)
// ==========================================

async function loadTeamBuckets() {
  const teamId = state.currentTeam?.team_id;
  if (!teamId) {
    teamBucketsCache = [];
    return [];
  }

  const result = await sbSelect('buckets', {
    teamId,
    orderBy: 'name',
    ascending: true
  });

  teamBucketsCache = (result.data || []).filter(b => !b.is_deleted);
  return teamBucketsCache;
}

function getBucketById(bucketId) {
  return teamBucketsCache.find(b => b.id === bucketId);
}

async function loadExchangeRates() {
  const teamId = state.currentTeam?.team_id;
  if (!teamId) {
    exchangeRatesCache = [];
    return [];
  }

  const result = await sbSelect('exchange_rates', {
    teamId,
    orderBy: 'date',
    ascending: false
  });

  exchangeRatesCache = (result.data || []).filter(r => !r.is_deleted);
  return exchangeRatesCache;
}

async function auditLog(action, entityType, entityId, oldValues, newValues) {
  try {
    if (!state.user?.id) return;
    await supabaseClient.rpc('log_audit', {
      p_user_id: state.user.id,
      p_action: action,
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_old_values: oldValues || null,
      p_new_values: newValues || null
    });
  } catch (err) {
    console.warn('Audit log non-critical error:', err.message);
  }
}

// ==========================================
// TRANSFER FUNDS PAGE
// ==========================================

export function getTransferFundsPage() {
  if (!state.canManageIncome) {
    return `
      <h1 class="page-title">Transfer Funds</h1>
      <div class="card">
        <h2>⛔ Access Denied</h2>
        <p>You do not have administrative permission to execute account value transfers.</p>
      </div>
    `;
  }

  return `
    <h1 class="page-title">Transfer Funds</h1>
    <div class="card" style="max-width: 700px;">
      <h2>🔄 Inter-Bucket Transfer</h2>
      <p style="color: #666; font-size: 0.9em; margin-bottom: 20px;">
        Move funds between team buckets. Exchange rates are applied automatically for cross-currency transfers.
      </p>
      
      <form id="transferFundsForm" onsubmit="window.executeFundsTransfer(event)">
        <div class="form-stack">
          <div class="form-grid-row form-grid-row--transfer-buckets">
            <div class="form-group"><label>Transfer Date</label><input type="date" id="trDate" required></div>
            <div class="form-group"><label>Source Bucket</label><select id="trSourceBucketId" required onchange="window.onTransferBucketChange()"><option value="">Loading…</option></select><span class="form-field-hint" id="trSourceCurrency">Currency: —</span></div>
            <div class="form-group"><label>Destination Bucket</label><select id="trDestBucketId" required onchange="window.onTransferBucketChange()"><option value="">Loading…</option></select><span class="form-field-hint" id="trDestCurrency">Currency: —</span></div>
          </div>
          <div class="form-grid-row form-grid-row--transfer-amount">
            <div class="form-group"><label>Amount <span id="trAmountCurrencyLabel" style="font-weight:600;color:#4f46e5;">(USD)</span></label><input type="number" class="input-amount" id="trAmount" step="0.01" placeholder="0.00" required oninput="window.onTransferAmountChange()"></div>
            <div class="form-group"><label id="trRateLabel">Rate (1 USD = ?)</label><input type="number" class="input-rate" id="trRate" step="any" min="0.000001" placeholder="95.4" oninput="window.onTransferAmountChange()"></div>
            <div class="form-group"><label>Converted <span id="trConvertedCurrencyLabel" style="font-weight:600;color:#4f46e5;"></span></label><input type="number" class="input-amount" id="trConvertedAmount" step="0.01" readonly style="background:#f3f4f6;"><span class="form-field-hint" id="trConvertedLabel">—</span></div>
          </div>
          <div class="form-group"><label>Reference Memo</label><textarea id="trMemo" rows="2" placeholder="Optional"></textarea></div>
        </div>

        <div id="trValidationError" style="color: #dc3545; font-size: 0.9em; margin-top: 12px; display: none;"></div>

        <button type="submit" id="trSubmitBtn" style="margin-top: 20px; width: 100%;">Execute Transfer Authorization</button>
      </form>
    </div>
  `;
}

export async function initTransferFundsPage() {
  if (!state.canManageIncome) return;

  // Set default date
  const d = document.getElementById('trDate');
  if (d) d.value = new Date().toISOString().split('T')[0];

  // Load team buckets
  await loadTeamBuckets();
  await loadExchangeRates();

  const sourceSelect = document.getElementById('trSourceBucketId');
  const destSelect = document.getElementById('trDestBucketId');

  if (sourceSelect) {
    sourceSelect.innerHTML = '<option value="">Select Source</option>';
    teamBucketsCache.forEach(b => {
      sourceSelect.innerHTML += `<option value="${b.id}" data-currency="${b.currency}">${b.name} (${b.currency})</option>`;
    });
  }

  if (destSelect) {
    destSelect.innerHTML = '<option value="">Select Destination</option>';
    teamBucketsCache.forEach(b => {
      destSelect.innerHTML += `<option value="${b.id}" data-currency="${b.currency}">${b.name} (${b.currency})</option>`;
    });
  }

  await loadUserTeamDefaultsForCurrentTeam();
  applyDefaultsToTransferForm({ sourceSelect, destSelect });

  window.onTransferBucketChange();
}

/**
 * Update currency labels and auto-compute exchange rate when buckets change.
 */
window.onTransferBucketChange = function() {
  const srcId = document.getElementById('trSourceBucketId')?.value;
  const destId = document.getElementById('trDestBucketId')?.value;
  const srcBucket = getBucketById(srcId);
  const destBucket = getBucketById(destId);

  const srcCurrencyEl = document.getElementById('trSourceCurrency');
  const destCurrencyEl = document.getElementById('trDestCurrency');
  const amountLabel = document.getElementById('trAmountCurrencyLabel');
  const convertedCurrencyLabel = document.getElementById('trConvertedCurrencyLabel');
  const rateInput = document.getElementById('trRate');
  const convertedInput = document.getElementById('trConvertedAmount');
  const convertedLabel = document.getElementById('trConvertedLabel');
  const rateLabel = document.getElementById('trRateLabel');

  if (srcBucket) {
    srcCurrencyEl.textContent = `Currency: ${srcBucket.currency}`;
    if (amountLabel) amountLabel.textContent = `(${srcBucket.currency})`;
  } else {
    srcCurrencyEl.textContent = 'Currency: —';
    if (amountLabel) amountLabel.textContent = '(USD)';
  }

  if (destBucket) {
    destCurrencyEl.textContent = `Currency: ${destBucket.currency}`;
    if (convertedCurrencyLabel) convertedCurrencyLabel.textContent = `(${destBucket.currency})`;
  } else {
    destCurrencyEl.textContent = 'Currency: —';
    if (convertedCurrencyLabel) convertedCurrencyLabel.textContent = '';
  }

  if (srcBucket && destBucket) {
    const srcCurr = srcBucket.currency || 'USD';
    const destCurr = destBucket.currency || 'USD';

    if (srcCurr === destCurr) {
      if (rateInput) rateInput.value = '1';
      if (rateLabel) rateLabel.textContent = 'Exchange Rate (1 USD = 1 USD)';
      if (convertedInput) convertedInput.value = '';
      if (convertedLabel) convertedLabel.textContent = 'Same currency — no conversion needed';
    } else if (srcCurr === 'USD') {
      const destRate = getLatestUsdRate(exchangeRatesCache, destCurr);
      if (rateLabel) rateLabel.textContent = `Exchange Rate (1 USD = ? ${destCurr})`;
      if (destRate !== null) {
        if (rateInput) rateInput.value = rateForInput(destRate);
        window.onTransferAmountChange();
      } else {
        if (rateInput && !rateInput.value) rateInput.value = '';
        if (convertedInput) convertedInput.value = '';
        if (convertedLabel) convertedLabel.textContent = `⚠️ No exchange rate found for ${destCurr}. Add a USD rate in Setup.`;
      }
    } else if (destCurr === 'USD') {
      const srcRate = getLatestUsdRate(exchangeRatesCache, srcCurr);
      if (rateLabel) rateLabel.textContent = `Exchange Rate (1 USD = ? ${srcCurr})`;
      if (srcRate !== null) {
        if (rateInput) rateInput.value = rateForInput(srcRate);
        window.onTransferAmountChange();
      } else {
        if (rateInput) rateInput.value = '';
        if (convertedInput) convertedInput.value = '';
        if (convertedLabel) convertedLabel.textContent = `⚠️ No exchange rate found for ${srcCurr}. Add a USD rate in Setup.`;
      }
    } else {
      const srcRate = getLatestUsdRate(exchangeRatesCache, srcCurr);
      const destRate = getLatestUsdRate(exchangeRatesCache, destCurr);
      if (rateLabel) rateLabel.textContent = `Exchange Rate (1 USD = ? ${srcCurr})`;
      if (srcRate !== null) {
        if (rateInput) rateInput.value = rateForInput(srcRate);
      } else {
        if (rateInput) rateInput.value = '';
      }
      if (destRate !== null && srcRate !== null) {
        if (convertedLabel) {
          convertedLabel.textContent = `Also using 1 USD = ${formatRate(destRate)} ${destCurr}`;
        }
        window.onTransferAmountChange();
      } else if (!destRate) {
        if (convertedInput) convertedInput.value = '';
        if (convertedLabel) convertedLabel.textContent = `⚠️ No exchange rate found for ${destCurr}. Add a USD rate in Setup.`;
      } else if (!srcRate) {
        if (convertedInput) convertedInput.value = '';
        if (convertedLabel) convertedLabel.textContent = `Enter source rate or add 1 USD = ? ${srcCurr} in Setup.`;
      }
    }
  } else {
    if (rateInput && !rateInput.value) rateInput.value = '';
    if (convertedInput) convertedInput.value = '';
    if (convertedLabel) convertedLabel.textContent = '—';
  }
};

window.onTransferAmountChange = function() {
  const amount = parseFloat(document.getElementById('trAmount')?.value) || 0;
  const rate = parseFloat(document.getElementById('trRate')?.value) || 0;
  const convertedInput = document.getElementById('trConvertedAmount');
  const convertedLabel = document.getElementById('trConvertedLabel');
  const srcId = document.getElementById('trSourceBucketId')?.value;
  const destId = document.getElementById('trDestBucketId')?.value;
  const srcBucket = getBucketById(srcId);
  const destBucket = getBucketById(destId);

  if (!srcBucket || !destBucket || amount <= 0) {
    if (convertedInput) convertedInput.value = '';
    return;
  }

  const srcCurr = srcBucket.currency || 'USD';
  const destCurr = destBucket.currency || 'USD';

  if (srcCurr === destCurr) {
    if (convertedInput) convertedInput.value = amount.toFixed(2);
    if (convertedLabel) convertedLabel.textContent = `Destination will receive ${amount.toFixed(2)} ${destCurr}`;
    return;
  }

  if (convertedInput) {
    let converted = null;

    if (srcCurr === 'USD' && destCurr !== 'USD') {
      if (rate <= 0) {
        convertedInput.value = '';
        return;
      }
      converted = amount * rate;
    } else if (srcCurr !== 'USD' && destCurr === 'USD') {
      if (rate <= 0) {
        convertedInput.value = '';
        return;
      }
      converted = amount / rate;
    } else {
      const srcUsdRate = rate > 0 ? rate : getLatestUsdRate(exchangeRatesCache, srcCurr);
      const destUsdRate = getLatestUsdRate(exchangeRatesCache, destCurr);
      if (!srcUsdRate || !destUsdRate || srcUsdRate <= 0 || destUsdRate <= 0) {
        convertedInput.value = '';
        return;
      }
      converted = (amount / srcUsdRate) * destUsdRate;
    }

    convertedInput.value = converted.toFixed(2);
    if (convertedLabel) {
      convertedLabel.textContent = `Destination will receive ${convertedInput.value} ${destCurr}`;
    }
  }
};

/**
 * Execute the transfer. Writes to the `transfers` table per Architect decision.
 */
window.executeFundsTransfer = async function(e) {
  e.preventDefault();

  const srcId = document.getElementById('trSourceBucketId').value;
  const destId = document.getElementById('trDestBucketId').value;
  const amount = parseFloat(document.getElementById('trAmount').value) || 0;
  const rate = parseFloat(document.getElementById('trRate').value) || 0;
  const memo = document.getElementById('trMemo').value.trim();

  const errorEl = document.getElementById('trValidationError');

  // Validation
  if (!srcId || !destId) {
    if (errorEl) { errorEl.textContent = 'Please select both source and destination buckets.'; errorEl.style.display = 'block'; }
    return;
  }
  if (srcId === destId) {
    if (errorEl) { errorEl.textContent = 'Source and destination buckets must be different.'; errorEl.style.display = 'block'; }
    return;
  }
  if (amount <= 0) {
    if (errorEl) { errorEl.textContent = 'Transfer amount must be greater than zero.'; errorEl.style.display = 'block'; }
    return;
  }

  const srcBucket = getBucketById(srcId);
  const destBucket = getBucketById(destId);

  if (!srcBucket || !destBucket) {
    if (errorEl) { errorEl.textContent = 'Selected bucket(s) are invalid or unavailable.'; errorEl.style.display = 'block'; }
    return;
  }

  const srcCurr = srcBucket.currency || 'USD';
  const destCurr = destBucket.currency || 'USD';

  if (srcCurr !== destCurr) {
    if (srcCurr !== 'USD' && destCurr !== 'USD') {
      const destUsdRate = getLatestUsdRate(exchangeRatesCache, destCurr);
      const srcUsdRate = rate > 0 ? rate : getLatestUsdRate(exchangeRatesCache, srcCurr);
      if (!srcUsdRate || !destUsdRate) {
        if (errorEl) {
          errorEl.textContent = `No valid exchange rates for ${srcCurr} → ${destCurr}. Add USD rates for both currencies in Setup.`;
          errorEl.style.display = 'block';
        }
        return;
      }
    } else if (rate <= 0) {
      if (errorEl) {
        errorEl.textContent = `No valid exchange rate available for ${srcCurr} → ${destCurr}. Please add a rate first.`;
        errorEl.style.display = 'block';
      }
      return;
    }
  }

  if (errorEl) errorEl.style.display = 'none';

  const teamId = state.currentTeam?.team_id;

  // Build transfer payload per `transfers` table schema
  const transferPayload = {
    team_id: teamId,
    date: document.getElementById('trDate').value,
    from_bucket_id: srcId,
    to_bucket_id: destId,
    amount: amount,
    rate: rate,
    currency: srcCurr,
    description: memo || 'Inter-bucket transfer',
    created_by: state.user?.id,
    created_at: new Date().toISOString()
  };

  const btn = document.getElementById('trSubmitBtn');
  btn.disabled = true;
  btn.textContent = 'Authorizing Transfer...';

  try {
    const result = await sbInsert('transfers', transferPayload);
    if (result && result.error) throw new Error(result.error.message);

    const savedTransfer = result.data?.[0] || { ...transferPayload, id: crypto.randomUUID() };

    // Audit log
    await auditLog('INSERT', 'transfers', savedTransfer.id, null, savedTransfer);

    showToast(
      `Successfully transferred ${amount.toFixed(2)} ${srcCurr} from ${srcBucket.name} to ${destBucket.name}!`,
      'success'
    );

    e.target.reset();
    window.onTransferBucketChange();
    window.showPage('income-manager');
  } catch (err) {
    console.error('Transfer execution error:', err);
    showToast(`Transfer failed: ${err.message || 'Database rejected transaction'}`, 'error');
    if (errorEl) {
      errorEl.textContent = `Error: ${err.message || 'Database rejected transaction'}`;
      errorEl.style.display = 'block';
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Execute Transfer Authorization';
  }
};