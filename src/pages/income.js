/* ========== INCOME MODULE ========== */
import { state } from '../state.js';
import { localGetAll, localPut, sbInsert, sbUpdate, sbSoftDelete, sbSelect, supabaseClient } from '../db.js';
import { showToast } from '../components/toasts.js';
import {
  getLatestUsdRate,
  calcUsdFromBucketAmount,
  splitIncomeAmounts,
  bucketAmountForEdit,
  rateDisplayLabel,
  normalizeUsdMultiplierRate,
  rateForInput,
  roundUsd,
  formatUsdDisplay,
  allocationsExceedIncome,
  ALLOCATION_TOLERANCE
} from '../utils/currency.js';
import { applyDefaultsToIncomeForm, loadUserTeamDefaultsForCurrentTeam } from '../utils/userTeamDefaults.js';

// ==========================================
// MODULE-LEVEL CACHE (team-scoped)
// ==========================================
let teamBucketsCache = [];
let exchangeRatesCache = [];

// ==========================================
// HELPERS: Team-scoped data loading
// ==========================================

/**
 * Load active buckets for the current team.
 * Populates teamBucketsCache for name/currency resolution.
 */
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

/**
 * Load exchange rates for the current team.
 * Cached for the session to avoid repeated round-trips.
 */
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

/**
 * Find exchange rate between two currencies.
 * Tries direct match first, then inverse.
 * Returns null if no rate found.
 */
function findExchangeRate(fromCurrency, toCurrency) {
  if (!fromCurrency || !toCurrency || fromCurrency === toCurrency) return 1;

  // USD-Multiplier convention: rate is always "1 USD = X local"
  // We ONLY look for rates where from_currency = 'USD' and to_currency = local currency
  // Never invert. If not found, return null and let user enter manually.

  if (fromCurrency === 'USD') {
    // USD → local: look for USD → local rate directly
    const direct = exchangeRatesCache.find(r =>
      r.from_currency === 'USD' && 
      r.to_currency === toCurrency &&
      !r.is_deleted
    );
    if (direct) return parseFloat(direct.rate);
    return null;
  }

  if (toCurrency === 'USD') {
    // local → USD: we still need the USD → local rate (e.g., 3.67)
    // Because the formula is: local_amount = usd_amount * rate
    // So rate should still be 3.67, not 0.2724
    const direct = exchangeRatesCache.find(r =>
      r.from_currency === 'USD' && 
      r.to_currency === fromCurrency &&
      !r.is_deleted
    );
    if (direct) return parseFloat(direct.rate);
    return null;
  }

  // Cross-local transfer (non-USD to non-USD): not supported by this convention
  return null;
}

/**
 * Non-blocking audit log wrapper.
 * Calls the log_audit RPC if available.
 */
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
    // Audit failure must not block the transaction
    console.warn('Audit log non-critical error:', err.message);
  }
}

// ==========================================
// 1. RECORD INCOME PAGE
// ==========================================

export function getRecordIncomePage() {
  if (!state.canManageIncome) {
    return `
      <h1 class="page-title">Add Income</h1>
      <div class="card">
        <h2>⛔ Access Denied</h2>
        <p>You do not have administrative permission to record financial inflows.</p>
      </div>
    `;
  }

  return `
    <h1 class="page-title">Add Income</h1>
    <div class="card">
      <h2>💵 Register New Funds Entry</h2>
      <form id="recordIncomeForm" onsubmit="window.createIncomeRecord(event)">
        <div class="form-stack">
          <div class="form-grid-row form-grid-row--income-record-main">
            <div class="form-group"><label class="required">Payment From</label><input type="text" id="incPaymentFrom" placeholder="KMOF" required></div>
            <div class="form-group"><label class="required">Amount <span id="incCurrencyLabel" style="font-weight:600;color:#4f46e5;">(USD)</span></label><input type="number" class="input-amount" id="incAmount" step="0.01" placeholder="0.00" required oninput="window.onIncomeMathFieldsChange()"></div>
            <div class="form-group"><label class="required">Payment Bucket</label><select id="incBucketId" required onchange="window.onIncomeBucketChange(this)"><option value="">Loading…</option></select></div>
          </div>
          <div class="form-grid-row form-grid-row--income-record-secondary">
            <div class="form-group"><label>Date</label><input type="date" id="incDate" required></div>
            <div class="form-group"><label>Currency</label><input type="text" id="incCurrencyDisplay" readonly value="USD" style="background:#f3f4f6;"></div>
            <div class="form-group"><label class="required" id="incExchangeRateLabel">Exchange Rate (1 USD = ?)</label><input type="number" class="input-rate" id="incExchangeRate" step="any" min="0.000001" placeholder="95.4" required oninput="window.onIncomeMathFieldsChange()"></div>
            <div class="form-group"><label id="incUsdEquivalentLabel">USD Equivalent</label><input type="number" class="input-amount" id="incLocalAmount" step="0.01" readonly style="background:#f3f4f6;"></div>
          </div>
          <div class="form-group"><label>Description / Notes</label><textarea id="incDescription" rows="2" placeholder="Optional notes…"></textarea></div>
        </div>

        <h3 style="margin-top: 30px;">Budget Allocations (USD)</h3>
        <p style="margin-bottom: 15px; color: #666; font-size: 0.9em;">
          Allocate parts or all of this income directly to active budget plans.
        </p>
        
        <div class="category-row-heading" style="grid-template-columns: 2fr 1fr 40px; max-width: 600px;">
          <span>Target Budget Plan</span>
          <span>Allocated Amount (USD)</span>
          <span></span>
        </div>
        <div id="incomeAllocationsContainer" style="max-width: 600px; margin-bottom: 15px;"></div>

        <div style="max-width: 600px; margin: 15px 0; padding: 15px; background: #f8f9fa; border-radius: 8px;">
          <div class="income-totals-bar" style="display: flex; justify-content: space-between; font-weight: bold; font-size: 0.95em;">
            <span>Total Income: $<span id="lblTotalIncomeDisplay">0.00</span></span>
            <span>Allocated: $<span id="lblTotalAllocatedDisplay">0.00</span></span>
            <span style="color: #4f46e5;">Unallocated: $<span id="lblUnallocatedDisplay">0.00</span></span>
          </div>
          <div id="allocationFormError" style="color: #dc3545; font-size: 0.85em; margin-top: 8px; display: none; font-weight: bold;"></div>
        </div>

        <div class="btn-group">
          <button type="button" class="secondary" onclick="window.addIncomeAllocationRow()">+ Add Budget Allocation</button>
          <button type="submit">Save Income Record</button>
        </div>
      </form>
    </div>
  `;
}

export async function initRecordIncomePage() {
  if (!state.canManageIncome) return;

  // Set default date
  const dateEl = document.getElementById('incDate');
  if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];

  // Load team buckets dynamically
  await loadTeamBuckets();

  const bucketSelect = document.getElementById('incBucketId');
  if (bucketSelect) {
    bucketSelect.innerHTML = '<option value="">Select Bucket</option>';
    teamBucketsCache.forEach(b => {
      bucketSelect.innerHTML += `<option value="${b.id}" data-currency="${b.currency}">${b.name} (${b.currency})</option>`;
    });
  }

  // Load exchange rates for rate auto-population
  await loadExchangeRates();

  // Clear allocations
  const container = document.getElementById('incomeAllocationsContainer');
  if (container) container.innerHTML = '';

  // Default math state
  window.onIncomeMathFieldsChange();

  await loadUserTeamDefaultsForCurrentTeam();
  const defaultBudgetId = applyDefaultsToIncomeForm({
    bucketSelect,
    paymentFromEl: document.getElementById('incPaymentFrom')
  });
  if (defaultBudgetId) {
    await window.addIncomeAllocationRow({ budget_id: defaultBudgetId });
  }

  const paymentFromEl = document.getElementById('incPaymentFrom');
  if (paymentFromEl) setTimeout(() => paymentFromEl.focus(), 100);
}

/**
 * When bucket selection changes, update currency display and auto-fetch rate.
 */
window.onIncomeBucketChange = function(selectEl) {
  const bucketId = selectEl.value;
  const bucket = getBucketById(bucketId);

  const currencyDisplay = document.getElementById('incCurrencyDisplay');
  const rateInput = document.getElementById('incExchangeRate');

  if (!bucket) {
    if (currencyDisplay) currencyDisplay.value = 'USD';
    if (rateInput) rateInput.value = '1';
    window.onIncomeMathFieldsChange();
    return;
  }

  const currency = bucket.currency || 'USD';
  // Currency display shows the BUCKET's currency (for reference)
  if (currencyDisplay) currencyDisplay.value = currency;

  // Only auto-populate rate if field is empty — respect user's manual edits
  if (currency === 'USD') {
    if (rateInput && !rateInput.value) rateInput.value = '1';
  } else {
    const rate = findExchangeRate(currency, 'USD');
    if (rateInput && !rateInput.value && rate !== null) {
      rateInput.value = rate.toFixed(6);
    }
  }

  window.onIncomeMathFieldsChange();
};

/**
 * Recalculate local amount and allocation summaries whenever amount or rate changes.
 */
window.onIncomeMathFieldsChange = function() {
  const amount = parseFloat(document.getElementById('incAmount')?.value) || 0;
  const rate = parseFloat(document.getElementById('incExchangeRate')?.value) || 0;
  const localInput = document.getElementById('incLocalAmount');

  // Local = USD / Rate (per confirmed architecture formula)
  if (localInput) {
    if (amount > 0 && rate > 0) {
      localInput.value = (amount / rate).toFixed(2);
    } else {
      localInput.value = '';
    }
  }

  const lblTotalIncome = document.getElementById('lblTotalIncomeDisplay');
  if (lblTotalIncome) lblTotalIncome.textContent = amount.toFixed(2);

  recalculateAllocationSummaries();
};

function recalculateAllocationSummaries() {
  const totalIncome = parseFloat(document.getElementById('incAmount')?.value) || 0;
  const rows = document.querySelectorAll('#incomeAllocationsContainer .income-alloc-row');

  let totalAllocated = 0;
  rows.forEach(row => {
    const val = parseFloat(row.querySelector('.alloc-usd-input')?.value) || 0;
    totalAllocated += val;
  });

  const unallocated = totalIncome - totalAllocated;

  const lblAllocated = document.getElementById('lblTotalAllocatedDisplay');
  const lblUnallocated = document.getElementById('lblUnallocatedDisplay');
  const errContainer = document.getElementById('allocationFormError');

  if (lblAllocated) lblAllocated.textContent = totalAllocated.toFixed(2);
  if (lblUnallocated) {
    lblUnallocated.textContent = unallocated.toFixed(2);
    lblUnallocated.parentElement.style.color = unallocated < 0 ? '#dc3545' : '#4f46e5';
  }

  if (errContainer) {
    if (unallocated < 0) {
      errContainer.textContent = `⚠️ Allocations exceed total income by $${Math.abs(unallocated).toFixed(2)} USD!`;
      errContainer.style.display = 'block';
    } else {
      errContainer.style.display = 'none';
    }
  }
}

window.addIncomeAllocationRow = async function(data = null) {
  const container = document.getElementById('incomeAllocationsContainer');
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'income-alloc-row';
  row.style = 'display: grid; grid-template-columns: 2fr 1fr 40px; gap: 10px; margin-bottom: 10px; align-items: center;';

  const defaultBudget = data ? (data.budgetId || data.budget_id || '') : '';
  const defaultAmount = data ? (data.amountUsd || data.amount_usd || '') : '';

  row.innerHTML = `
    <select class="alloc-budget-select" required data-selected="${defaultBudget}">
      <option value="">Select Budget Plan</option>
    </select>
    <input type="number" class="alloc-usd-input input-amount" step="0.01" placeholder="1245.50" value="${defaultAmount}" required oninput="window.onAllocationRowAmountInput()">
    <button type="button" class="cat-remove-btn" onclick="this.closest('.income-alloc-row').remove(); window.onAllocationRowAmountInput();" style="margin: 0; padding: 4px;">×</button>
  `;

  container.appendChild(row);

  // Load budget plans scoped to current team
  const teamId = state.currentTeam?.team_id;
  let plans = state.budgetPlans || [];
  if (plans.length === 0) {
    const all = await localGetAll('budget_plans');
    plans = all.filter(b => b.team_id === teamId && !b.is_deleted);
    state.budgetPlans = plans;
  }

  const selectEl = row.querySelector('.alloc-budget-select');
  plans.forEach(plan => {
    const selectedAttr = plan.id === defaultBudget ? 'selected' : '';
    selectEl.innerHTML += `<option value="${plan.id}" ${selectedAttr}>${plan.name} (${plan.status || 'draft'})</option>`;
  });
  if (defaultBudget) selectEl.value = defaultBudget;
};

window.onAllocationRowAmountInput = function() {
  recalculateAllocationSummaries();
};

/**
 * Create a new income record.
 * Uses bucket_id (UUID) per Architect decision. Keeps payment_bucket as text for transition.
 */
window.createIncomeRecord = async function(e) {
  e.preventDefault();

  const paymentFrom = document.getElementById('incPaymentFrom').value.trim();
  if (!paymentFrom) {
    showToast('Please enter who the payment is from.', 'error');
    return;
  }

  const bucketId = document.getElementById('incBucketId').value;
  if (!bucketId) {
    showToast('Please select a payment bucket.', 'error');
    return;
  }

  const bucket = getBucketById(bucketId);
  if (!bucket) {
    showToast('Selected bucket is invalid or no longer available.', 'error');
    return;
  }

  const totalIncome = parseFloat(document.getElementById('incAmount').value) || 0;
  if (totalIncome <= 0) {
    showToast('Income amount must be greater than zero.', 'error');
    return;
  }

  const currency = bucket.currency || 'USD';
  const rate = normalizeUsdMultiplierRate(
    parseFloat(document.getElementById('incExchangeRate').value) || 0,
    currency
  );
  if (rate <= 0) {
    showToast('Please enter a valid exchange rate.', 'error');
    return;
  }
  const { amount_usd, local_amount } = splitIncomeAmounts(totalIncome, currency, rate);

  const allocRows = document.querySelectorAll('#incomeAllocationsContainer .income-alloc-row');
  let allocations = [];
  let totalAllocated = 0;

  allocRows.forEach(row => {
    const budgetId = row.querySelector('.alloc-budget-select').value;
    const amountUsd = parseFloat(row.querySelector('.alloc-usd-input').value) || 0;
    if (budgetId && amountUsd > 0) {
      allocations.push({ budget_id: budgetId, amount_usd: amountUsd });
      totalAllocated += amountUsd;
    }
  });

  if (totalAllocated > totalIncome) {
    showToast('Cannot save. Allocations exceed your registered income amount.', 'error');
    return;
  }

  const teamId = state.currentTeam?.team_id;

  const incomePayload = {
    team_id: teamId,
    date: document.getElementById("incDate").value,
    payment_from: document.getElementById("incPaymentFrom").value.trim(),
    // Architect decision: migrate to bucket_id (UUID). payment_bucket kept for transition.
    bucket_id: bucketId,
    payment_bucket: bucket.name,
    amount_usd: amount_usd,
    currency: bucket.currency || "USD",
    exchange_rate: rate,
    local_amount: local_amount,
 description: document.getElementById('incDescription').value.trim(),
    budget_allocations: allocations,
    created_by: state.user?.id,
    is_deleted: false,
    updated_at: new Date().toISOString()
  };

  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving Record...';

  try {
    const result = await sbInsert('income', incomePayload);
    if (result && result.error) throw new Error(result.error.message);

    const savedRecord = result.data?.[0] || { ...incomePayload, id: crypto.randomUUID() };
    await localPut('income', savedRecord);

    // Audit log the creation
    await auditLog('INSERT', 'income', savedRecord.id, null, savedRecord);

    // Refresh state cache
    state.incomeRecords = [];

    showToast('Income record saved and allocated successfully!', 'success');
    e.target.reset();
    window.showPage('income-manager');
  } catch (err) {
    console.error('Save income transaction error:', err);
    showToast(`Error: ${err.message || 'Failed to save transaction'}`, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Income Record';
  }
};

// ==========================================
// 2. INCOME MANAGER (VIEW / FILTER / EDIT)
// ==========================================

export function getIncomeManagerPage() {
  if (!state.canManageIncome) {
    return `
      <h1 class="page-title">Income Manager</h1>
      <div class="card">
        <h2>⛔ Access Denied</h2>
        <p>You do not have administrative permission to view ledger transaction entries.</p>
      </div>
    `;
  }

  return `
    <h1 class="page-title">Income Manager</h1>
    <div class="card">
      <h2>🔍 Filter Transactions</h2>
      <div class="filter-section">
        <div class="form-stack">
          <div class="form-grid-row form-grid-row--filter-main">
            <div class="form-group"><label>Bucket</label><select id="filterIncBucket" onchange="window.initIncomeManagerPage()"><option value="all">All Accounts</option></select></div>
            <div class="form-group"><label>Budget</label><select id="filterIncBudget" onchange="window.initIncomeManagerPage()"><option value="all">All Budgets</option></select></div>
            <div class="form-group"><label>Received From</label><input type="text" id="filterIncFrom" placeholder="Search…" oninput="window.initIncomeManagerPage()"></div>
          </div>
          <div class="form-grid-row form-grid-row--filter-dates">
            <div class="form-group"><label>From</label><input type="date" id="filterIncDateFrom" onchange="window.initIncomeManagerPage()"></div>
            <div class="form-group"><label>To</label><input type="date" id="filterIncDateTo" onchange="window.initIncomeManagerPage()"></div>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>📊 Historical Inflow Ledger</h2>
      <div class="table-container show-desktop">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Received From</th>
              <th>Bucket</th>
              <th>Total (USD)</th>
              <th>Foreign Valuation</th>
              <th>Allocations</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="incomeLedgerBody"></tbody>
        </table>
      </div>
      <div id="incomeMobileList" class="show-mobile data-card-list"></div>
    </div>

    <div id="editIncomeModal" class="modal">
      <div class="modal-content" style="max-width: 800px;">
        <button class="close-modal" onclick="window.closeEditIncomeModal()">&times;</button>
        <h2>Edit Income Entry & Splits</h2>
        <form id="editIncomeForm" onsubmit="window.saveEditedIncomeRecord(event)">
          <input type="hidden" id="editIncId">
          
          <div class="form-stack">
            <div class="form-grid-row form-grid-row--income-edit-main">
              <div class="form-group"><label class="required">Payment From</label><input type="text" id="editIncPaymentFrom" required></div>
              <div class="form-group"><label class="required">Amount <span id="editIncCurrencyLabel" style="font-weight:600;color:#4f46e5;">(USD)</span></label><input type="number" class="input-amount" id="editIncAmount" step="0.01" required oninput="window.onEditIncomeMathChange()"></div>
              <div class="form-group"><label class="required">Bucket</label><select id="editIncBucketId" required onchange="window.onEditIncomeBucketChange(this)"><option value="">Loading…</option></select></div>
            </div>
            <div class="form-grid-row form-grid-row--income-edit-meta">
              <div class="form-group"><label>Date</label><input type="date" id="editIncDate" required></div>
              <div class="form-group"><label>Currency</label><input type="text" id="editIncCurrencyDisplay" readonly style="background:#f3f4f6;"></div>
              <div class="form-group"><label class="required" id="editIncExchangeRateLabel">Rate (1 USD = ?)</label><input type="number" class="input-rate" id="editIncExchangeRate" step="any" min="0.000001" required oninput="window.onEditIncomeMathChange()"></div>
              <div class="form-group"><label id="editIncUsdEquivalentLabel">USD Equivalent</label><input type="number" class="input-amount" id="editIncLocalAmount" step="0.01" readonly style="background:#f3f4f6;"></div>
            </div>
            <div class="form-group"><label>Description</label><textarea id="editIncDescription" rows="2"></textarea></div>
          </div>

          <h3 style="margin-top: 20px;">Split Allocations</h3>
          <div id="editIncomeAllocationsContainer" style="margin-bottom: 15px;"></div>
          
          <div class="income-totals-bar" style="padding: 12px; background: #f8f9fa; border-radius: 6px; margin-bottom: 15px; display: flex; justify-content: space-between; font-weight: bold; font-size: 0.9em;">
            <span>Total Income: $<span id="lblEditTotalIncome">0.00</span></span>
            <span>Allocated: $<span id="lblEditAllocated">0.00</span></span>
            <span>Unallocated: $<span id="lblEditUnallocated">0.00</span></span>
          </div>

          <div class="btn-group">
            <button type="button" class="secondary" onclick="window.addEditIncomeAllocationRow()">+ Add Split</button>
            <button type="submit" class="success">Save Changes</button>
            <button type="button" class="secondary" onclick="window.closeEditIncomeModal()">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

export async function initIncomeManagerPage() {
  if (!state.canManageIncome) return;

  const tbody = document.getElementById('incomeLedgerBody');
  const mobile = document.getElementById('incomeMobileList');
  if (!tbody) return;

  const teamId = state.currentTeam?.team_id;
  if (!teamId) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#888; padding:20px;">No team selected.</td></tr>`;
    return;
  }

  // Ensure buckets are loaded for name resolution
  if (teamBucketsCache.length === 0) {
    await loadTeamBuckets();
  }

  // Populate bucket filter dropdown
  const filterSelect = document.getElementById('filterIncBucket');
  if (filterSelect && filterSelect.options.length <= 1) {
    filterSelect.innerHTML = '<option value="all">All Accounts</option>';
    teamBucketsCache.forEach(b => {
      filterSelect.innerHTML += `<option value="${b.id}">${b.name}</option>`;
    });
  }

  // Load income records
  if (!state.incomeRecords || state.incomeRecords.length === 0) {
    const all = await localGetAll('income');
    state.incomeRecords = all.filter(i => i.team_id === teamId && !i.is_deleted);
  }

  // Load budget plans for allocation name resolution
  let plans = state.budgetPlans || [];
  if (plans.length === 0) {
    const allPlans = await localGetAll('budget_plans');
    plans = allPlans.filter(p => p.team_id === teamId && !p.is_deleted);
    state.budgetPlans = plans;
  }

  const filterBucketId = document.getElementById('filterIncBucket')?.value || 'all';
  const filterFrom = document.getElementById('filterIncFrom')?.value.toLowerCase().trim() || '';

  let records = [...(state.incomeRecords || [])];

  if (filterBucketId !== 'all') {
    records = records.filter(r => r.bucket_id === filterBucketId);
  }
  if (filterFrom) {
    records = records.filter(r => (r.payment_from || '').toLowerCase().includes(filterFrom));
  }

  if (records.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #888; padding: 20px;">No matching transactional inflows found.</td></tr>`;
    if (mobile) mobile.innerHTML = '<p class="empty-state">No matching transactional inflows found.</p>';
    return;
  }

  let tableHtml = '';
  let mobileHtml = '';

  records.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(rec => {
    const allocs = rec.budget_allocations || [];
    let allocSummaryText = allocs.length === 0
      ? '<span style="color: #888; font-size:0.85em;">Unallocated</span>'
      : '';

    allocs.forEach(a => {
      const targetPlan = plans.find(p => p.id === a.budget_id);
      const name = targetPlan ? targetPlan.name : 'Unknown Plan';
      allocSummaryText += `<div style="font-size:0.8em; margin-bottom:2px;">💼 ${name}: <strong>$${(a.amount_usd || 0).toFixed(2)}</strong></div>`;
    });

    // Resolve bucket name from cache
    const bucket = getBucketById(rec.bucket_id);
    const bucketName = bucket ? bucket.name : (rec.payment_bucket || 'Unknown');
    const bucketCurrency = bucket ? bucket.currency : (rec.currency || 'USD');

    const valDisplay = rec.currency !== 'USD'
      ? `${(rec.local_amount || 0).toLocaleString()} ${rec.currency} (@ ${rec.exchange_rate})`
      : '-';

    const allocPlain = allocs.length === 0
      ? 'Unallocated'
      : allocs.map(a => {
          const targetPlan = plans.find(p => p.id === a.budget_id);
          const name = targetPlan ? targetPlan.name : 'Unknown Plan';
          return `${name}: $${(a.amount_usd || 0).toFixed(2)}`;
        }).join(' · ');

    tableHtml += `
      <tr>
        <td data-label="Date"><strong>${rec.date}</strong></td>
        <td data-label="From">${rec.payment_from || 'Unknown'}</td>
        <td data-label="Bucket"><span class="badge badge-info">${bucketName}</span></td>
        <td data-label="USD"><strong>$${(rec.amount_usd || 0).toFixed(2)}</strong></td>
        <td data-label="Foreign">${valDisplay}</td>
        <td data-label="Allocations">${allocSummaryText}</td>
        <td data-label="Actions" class="action-buttons">
          <button class="info small" onclick="window.openEditIncomeRecord('${rec.id}')">Edit</button>
          <button class="danger small" onclick="window.deleteIncomeRecord('${rec.id}')">Delete</button>
        </td>
      </tr>
    `;

    mobileHtml += `
      <article class="data-card data-card--compact">
        <div class="data-card-top">
          <span class="data-card-title">${rec.payment_from || 'Unknown'}</span>
          <span class="data-card-badges">$${(rec.amount_usd || 0).toFixed(2)}</span>
        </div>
        <div class="data-card-summary">${rec.date} · ${bucketName} (${bucketCurrency})</div>
        <div class="data-card-summary">${allocPlain}</div>
        ${valDisplay !== '-' ? `<div class="data-card-sub">${valDisplay}</div>` : ''}
        <div class="data-card-actions">
          <button class="info small" onclick="window.openEditIncomeRecord('${rec.id}')">Edit</button>
          <button class="danger small" onclick="window.deleteIncomeRecord('${rec.id}')">Delete</button>
        </div>
      </article>
    `;
  });

  tbody.innerHTML = tableHtml;
  if (mobile) mobile.innerHTML = mobileHtml;
}
window.initIncomeManagerPage = initIncomeManagerPage;

window.openEditIncomeRecord = async function(id) {
  const rec = state.incomeRecords.find(r => r.id === id);
  if (!rec) return;

  // Ensure buckets loaded
  if (teamBucketsCache.length === 0) await loadTeamBuckets();
  if (exchangeRatesCache.length === 0) await loadExchangeRates();

  document.getElementById('editIncId').value = rec.id;
  document.getElementById('editIncDate').value = rec.date;
  document.getElementById('editIncPaymentFrom').value = rec.payment_from || '';

  // Populate bucket dropdown
  const bucketSelect = document.getElementById('editIncBucketId');
  bucketSelect.innerHTML = '<option value="">Select Bucket</option>';
  teamBucketsCache.forEach(b => {
    bucketSelect.innerHTML += `<option value="${b.id}" data-currency="${b.currency}">${b.name} (${b.currency})</option>`;
  });
  bucketSelect.value = rec.bucket_id || '';

  // Trigger currency/rate update
  window.onEditIncomeBucketChange(bucketSelect);

  document.getElementById('editIncAmount').value = rec.amount_usd || 0;
  document.getElementById('editIncExchangeRate').value = rec.exchange_rate || 1;
  document.getElementById('editIncDescription').value = rec.description || '';

  // Recalculate local amount
  window.onEditIncomeMathChange();

  // Load allocations
  const container = document.getElementById('editIncomeAllocationsContainer');
  container.innerHTML = '';
  const allocs = rec.budget_allocations || [];
  allocs.forEach(a => window.addEditIncomeAllocationRow(a));

  document.getElementById('editIncomeModal').classList.add('active');
};

window.onEditIncomeBucketChange = function(selectEl) {
  const bucketId = selectEl.value;
  const bucket = getBucketById(bucketId);

  const currencyDisplay = document.getElementById('editIncCurrencyDisplay');
  const rateInput = document.getElementById('editIncExchangeRate');

  if (!bucket) {
    if (currencyDisplay) currencyDisplay.value = 'USD';
    return;
  }

  const currency = bucket.currency || 'USD';
  if (currencyDisplay) currencyDisplay.value = currency;

  if (!preserveRate) {
    if (currency === 'USD') {
      if (rateInput) rateInput.value = '1';
      if (rateLabel) rateLabel.textContent = 'Rate (1 USD = 1 USD)';
    } else {
      const rate = getLatestUsdRate(exchangeRatesCache, currency);
      if (rateInput) rateInput.value = rate !== null ? rateForInput(rate) : '';
      if (rateLabel) rateLabel.textContent = `Rate (1 USD = ? ${currency})`;
    }
  } else if (rateLabel) {
    rateLabel.textContent = currency === 'USD'
      ? 'Rate (1 USD = 1 USD)'
      : `Rate (1 USD = ? ${currency})`;
  }

  window.onEditIncomeMathChange();
};

window.addEditIncomeAllocationRow = async function(data = null) {
  const container = document.getElementById('editIncomeAllocationsContainer');
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'income-alloc-row';
  row.style = 'display: grid; grid-template-columns: 2fr 1fr 40px; gap: 10px; margin-bottom: 10px; align-items: center;';

  const defaultBudget = data ? (data.budget_id || data.budgetId || '') : '';
  const defaultAmount = data ? (data.amount_usd || data.amountUsd || '') : '';

  row.innerHTML = `
    <select class="edit-alloc-budget-select" required>
      <option value="">Select Budget</option>
    </select>
    <input type="number" class="edit-alloc-usd-input" step="0.01" placeholder="1245.50" value="${defaultAmount}" required oninput="window.onEditIncomeMathChange()">
    <button type="button" class="cat-remove-btn" onclick="this.closest('.income-alloc-row').remove(); window.onEditIncomeMathChange();" style="margin:0; padding:4px;">×</button>
  `;
  container.appendChild(row);

  const selectEl = row.querySelector('.edit-alloc-budget-select');
  const plans = state.budgetPlans || [];
  plans.forEach(plan => {
    const selectedAttr = plan.id === defaultBudget ? 'selected' : '';
    selectEl.innerHTML += `<option value="${plan.id}" ${selectedAttr}>${plan.name}</option>`;
  });
  if (defaultBudget) selectEl.value = defaultBudget;
};

window.onEditIncomeMathChange = function() {
  const amount = parseFloat(document.getElementById('editIncAmount').value) || 0;
  const rate = parseFloat(document.getElementById('editIncExchangeRate').value) || 0;
  const localInput = document.getElementById('editIncLocalAmount');

  if (localInput) {
    if (amount > 0 && rate > 0) {
      localInput.value = (amount / rate).toFixed(2);
    } else {
      localInput.value = '';
    }
  }

  const rows = document.querySelectorAll('#editIncomeAllocationsContainer .income-alloc-row');
  let allocated = 0;
  rows.forEach(row => {
    allocated += parseFloat(row.querySelector('.edit-alloc-usd-input').value) || 0;
  });

  document.getElementById('lblEditTotalIncome').textContent = amount.toFixed(2);
  document.getElementById('lblEditAllocated').textContent = allocated.toFixed(2);

  const unallocated = amount - allocated;
  const unallocEl = document.getElementById('lblEditUnallocated');
  unallocEl.textContent = unallocated.toFixed(2);
  unallocEl.style.color = unallocated < 0 ? '#dc3545' : '#333';
};

window.saveEditedIncomeRecord = async function(e) {
  e.preventDefault();

  const id = document.getElementById('editIncId').value;
  const bucketId = document.getElementById('editIncBucketId').value;
  const bucketAmount = parseFloat(document.getElementById('editIncAmount').value) || 0;
  const bucket = getBucketById(bucketId);
  const currency = bucket ? bucket.currency : 'USD';
  const rate = normalizeUsdMultiplierRate(
    parseFloat(document.getElementById('editIncExchangeRate').value) || 1,
    currency
  );

  if (!bucketId) {
    showToast('Please select a payment bucket.', 'error');
    return;
  }
  if (bucketAmount <= 0) {
    showToast('Amount must be greater than zero.', 'error');
    return;
  }

  const { amount_usd, local_amount } = splitIncomeAmounts(bucketAmount, currency, rate);

  const rows = document.querySelectorAll('#editIncomeAllocationsContainer .income-alloc-row');

  let allocations = [];
  let totalAllocated = 0;
  rows.forEach(row => {
    const bId = row.querySelector('.edit-alloc-budget-select').value;
    const amt = parseFloat(row.querySelector('.edit-alloc-usd-input').value) || 0;
    if (bId && amt > 0) {
      allocations.push({ budget_id: bId, amount_usd: amt });
      totalAllocated += amt;
    }
  });

  if (allocationsExceedIncome(totalAllocated, amount_usd)) {
    showToast('Allocations exceed total income value!', 'error');
    return;
  }

  const teamId = state.currentTeam?.team_id;
  const existing = state.incomeRecords.find(r => r.id === id) || {};

  const updatedRecord = {
    ...existing,
    date: document.getElementById('editIncDate').value,
    payment_from: document.getElementById('editIncPaymentFrom').value.trim(),
    bucket_id: bucketId,
    payment_bucket: bucket ? bucket.name : (existing.payment_bucket || ''),
    amount_usd,
    currency,
    exchange_rate: rate,
    local_amount,
    description: document.getElementById('editIncDescription').value.trim(),
    budget_allocations: allocations,
    updated_at: new Date().toISOString()
  };

  try {
    const result = await sbUpdate('income', updatedRecord, { id });
    if (result && result.error) throw new Error(result.error.message);

    const saved = result.data?.[0] || updatedRecord;
    await localPut('income', saved);

    // Audit log the update
    await auditLog('UPDATE', 'income', id, existing, saved);

    // Refresh cache
    state.incomeRecords = [];
    const all = await localGetAll('income');
    state.incomeRecords = all.filter(i => i.team_id === teamId && !i.is_deleted);

    showToast('Inflow record updated successfully!', 'success');
    document.getElementById('editIncomeModal').classList.remove('active');
    initIncomeManagerPage();
  } catch (err) {
    console.error('Update income error:', err);
    showToast(`Failed: ${err.message}`, 'error');
  }
};

window.deleteIncomeRecord = async function(id) {
  if (!confirm('Are you sure you want to delete this income entry? Allocations tied to it will clear.')) return;

  const existing = state.incomeRecords.find(r => r.id === id);

  try {
    const result = await sbSoftDelete('income', id);
    if (result && result.error) throw new Error(result.error.message);

    const teamId = state.currentTeam?.team_id;
    state.incomeRecords = [];
    const all = await localGetAll('income');
    state.incomeRecords = all.filter(i => i.team_id === teamId && !i.is_deleted);

    // Audit log the soft delete
    await auditLog('DELETE', 'income', id, existing, null);

    showToast('Income record removed.', 'success');
    initIncomeManagerPage();
  } catch (err) {
    console.error('Delete income error:', err);
    showToast('Failed to drop record', 'error');
  }
};

window.closeEditIncomeModal = function() {
  document.getElementById('editIncomeModal').classList.remove('active');
};