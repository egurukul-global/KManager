/* ========== INCOME MODULE ========== */
import { state } from '../state.js';
import { localGetAll, localPut, sbInsert, sbUpdate, sbSoftDelete, sbSelect, supabaseClient } from '../db.js';
import { showToast, showConfirm } from '../components/toasts.js';
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
  ALLOCATION_TOLERANCE,
  localToUsd
} from '../utils/currency.js';
import { applyDefaultsToIncomeForm, loadUserTeamDefaultsForCurrentTeam } from '../utils/userTeamDefaults.js';
import { btnIconEdit, btnIconDelete, cardRow } from '../utils/uiHelpers.js';
import { getBudgetStatus } from '../utils/budgetStatus.js';
import { ensureUnallocatedBudgetExists } from './budgets.js';

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
    <div class="card" style="border-left: 4px solid var(--warning); background-color: #fffbeb; padding: 15px; margin-bottom: 20px;">
      <h3 style="color: #b45309; margin-top: 0; margin-bottom: 8px;">⚠️ For External Funds Only</h3>
      <p style="color: #92400e; font-size: 0.9em; margin: 0;">
        This form is strictly for recording <strong>new, external money</strong> entering the organization (e.g., direct donor deposits, external cash). <br/><br/>
        <strong>Do not use this form</strong> for money received from Finance, KMOF, or other internal teams. All internal money movements must be accepted via the <a href="#" onclick="window.showPage('transfer')" style="color: #b45309; font-weight: bold; text-decoration: underline;">Transfers Module</a>.
      </p>
    </div>
    <div class="card">
      <h2>💵 Register New Funds Entry</h2>
      <form id="recordIncomeForm" onsubmit="window.createIncomeRecord(event)">
        <div class="form-stack">
          <div class="form-grid-row form-grid-row--income-record-main">
            <div class="form-group"><label class="required">Payment From</label><input type="text" id="incPaymentFrom" placeholder="KMOF" required></div>
            <div class="form-group"><label class="required">Amount <span id="incCurrencyLabel" style="color: var(--primary);">(USD)</span></label><input type="number" class="input-amount" id="incAmount" step="0.01" placeholder="0.00" required oninput="window.onIncomeMathFieldsChange()"></div>
            <div class="form-group"><label class="required">Payment Bucket</label><select id="incBucketId" required onchange="window.onIncomeBucketChange(this)"><option value="">Loading…</option></select></div>
          </div>
          <div class="form-grid-row form-grid-row--income-record-secondary">
            <div class="form-group"><label>Date</label><input type="date" id="incDate" required></div>
            <div class="form-group"><label>Currency</label><input type="text" id="incCurrencyDisplay" readonly value="USD" style="background:#f3f4f6;"></div>
            <div class="form-group"><label class="required" id="incExchangeRateLabel">Exchange Rate (1 USD = ?)</label><input type="number" class="input-rate" id="incExchangeRate" step="any" min="0.000001" placeholder="95.4" required readonly oninput="window.onIncomeMathFieldsChange()"></div>
            <div class="form-group"><label id="incUsdEquivalentLabel">USD Equivalent</label><input type="number" class="input-amount" id="incLocalAmount" step="0.01" readonly style="background:#f3f4f6;"></div>
          </div>
          <div class="form-group"><label>Description / Notes</label><textarea id="incDescription" rows="2" placeholder="Optional notes…"></textarea></div>
        </div>

        
        <div class="btn-group" style="margin-top: 20px;">
          <button type="submit" class="success">Save Income</button>
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
      const unallocated = teamBucketsCache.find(b => b.name === 'General Funds (Unallocated)' || b.is_system_bucket);
      if (unallocated) {
        bucketSelect.innerHTML += '<option value="' + unallocated.id + '" data-currency="' + unallocated.currency + '">' + unallocated.name + ' (' + unallocated.currency + ')</option>';
        bucketSelect.value = unallocated.id;
        setTimeout(() => window.onIncomeBucketChange(bucketSelect), 50);
      } else {
        teamBucketsCache.filter(b => b.is_active !== false).forEach(b => {
          bucketSelect.innerHTML += '<option value="' + b.id + '" data-currency="' + b.currency + '">' + b.name + ' (' + b.currency + ')</option>';
        });
      }
    }

  // Load exchange rates for rate auto-population
  await loadExchangeRates();

  // Clear allocations
  const container = document.getElementById('incomeAllocationsContainer');
  if (container) container.innerHTML = '';
  updateAllocationEmptyHint();

  // Default math state
  window.onIncomeMathFieldsChange();

  await loadUserTeamDefaultsForCurrentTeam();
  const defaultBudgetId = applyDefaultsToIncomeForm({
    bucketSelect,
    paymentFromEl: document.getElementById('incPaymentFrom')
  });
  // User adds allocations via modal (+ Add Budget Allocation)

  const paymentFromEl = document.getElementById('incPaymentFrom');
  if (paymentFromEl) setTimeout(() => paymentFromEl.focus(), 100);
}

/**
 * When bucket selection changes, update currency display and auto-fetch rate.
 */
function updateIncomeAmountCurrencyLabel(currency, labelId) {
  const el = document.getElementById(labelId);
  if (el) el.textContent = `(${currency || 'USD'})`;
}

function getIncomeUsdEquivalent(amountElId, rateElId, bucketId) {
  const amount = parseFloat(document.getElementById(amountElId)?.value) || 0;
  const rate = parseFloat(document.getElementById(rateElId)?.value) || 0;
  const bucket = getBucketById(bucketId);
  const currency = bucket?.currency || 'USD';
  if (currency === 'USD') return amount;
  return rate > 0 ? localToUsd(amount, rate) : 0;
}

window.onIncomeBucketChange = function(selectEl) {
  const bucketId = selectEl.value;
  const bucket = getBucketById(bucketId);

  const currencyDisplay = document.getElementById('incCurrencyDisplay');
  const rateInput = document.getElementById('incExchangeRate');

  if (!bucket) {
    if (currencyDisplay) currencyDisplay.value = 'USD';
    updateIncomeAmountCurrencyLabel('USD', 'incCurrencyLabel');
    if (rateInput) rateInput.value = '1';
    window.onIncomeMathFieldsChange();
    return;
  }

  const currency = bucket.currency || 'USD';
  if (currencyDisplay) currencyDisplay.value = currency;
  updateIncomeAmountCurrencyLabel(currency, 'incCurrencyLabel');

  // Only auto-populate rate if field is empty — respect user's manual edits
  if (currency === 'USD') {
    if (rateInput) rateInput.value = '1';
  } else {
    const rate = getLatestUsdRate(exchangeRatesCache, currency);
    if (rateInput && rate !== null) {
      rateInput.value = rateForInput(rate);
      window.onIncomeMathFieldsChange();
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

  // Bucket amount is in local currency; show USD equivalent = local ÷ rate.
  if (localInput) {
    if (amount > 0 && rate > 0) {
      localInput.value = formatUsdDisplay(localToUsd(amount, rate));
    } else {
      localInput.value = '';
    }
  }

  const lblTotalIncome = document.getElementById('lblTotalIncomeDisplay');
  const bucketId = document.getElementById('incBucketId')?.value;
  const incomeUsd = getIncomeUsdEquivalent('incAmount', 'incExchangeRate', bucketId);
  if (lblTotalIncome) lblTotalIncome.textContent = formatUsdDisplay(incomeUsd);

  recalculateAllocationSummaries();
};

function recalculateAllocationSummaries() {
  const bucketId = document.getElementById('incBucketId')?.value;
  const totalIncomeUsd = getIncomeUsdEquivalent('incAmount', 'incExchangeRate', bucketId);
  const rows = document.querySelectorAll('#incomeAllocationsContainer .income-alloc-row');

  let totalAllocated = 0;
  rows.forEach(row => {
    const val = parseFloat(row.dataset.amountUsd) || parseFloat(row.querySelector('.alloc-usd-input')?.value) || 0;
    totalAllocated += val;
  });

  const unallocated = totalIncomeUsd - totalAllocated;

  const lblAllocated = document.getElementById('lblTotalAllocatedDisplay');
  const lblUnallocated = document.getElementById('lblUnallocatedDisplay');
  const errContainer = document.getElementById('allocationFormError');

  if (lblAllocated) lblAllocated.textContent = totalAllocated.toFixed(2);
  if (lblUnallocated) {
    lblUnallocated.textContent = unallocated.toFixed(2);
    const unallocRow = lblUnallocated.closest('.data-card-row-value');
    if (unallocRow) {
      unallocRow.classList.toggle('negative', unallocated < 0);
      unallocRow.classList.toggle('positive', unallocated >= 0);
    }
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

async function getBudgetPlansForTeam() {
  const teamId = state.currentTeam?.team_id;
  let plans = state.budgetPlans || [];
  if (plans.length === 0) {
    const all = await localGetAll('budget_plans');
    plans = all.filter(b => b.team_id === teamId && !b.is_deleted);
    state.budgetPlans = plans;
  }
  return plans;
}

function updateAllocationEmptyHint() {
  const container = document.getElementById('incomeAllocationsContainer');
  const hint = document.getElementById('allocEmptyHint');
  if (!hint) return;
  const count = container?.querySelectorAll('.income-alloc-row').length || 0;
  hint.style.display = count === 0 ? 'block' : 'none';
}

function appendAllocationSummaryRow(container, budgetId, amountUsd, budgetName, forEdit = false) {
  if (!container || !budgetId) return;
  const row = document.createElement('article');
  row.className = 'data-card data-card--compact alloc-entry-card income-alloc-row';
  row.dataset.budgetId = budgetId;
  row.dataset.amountUsd = amountUsd || '';
  const removeHandler = forEdit
    ? `this.closest('.income-alloc-row').remove(); window.onEditIncomeMathChange(); window.updateAllocationEmptyHint && window.updateAllocationEmptyHint();`
    : `this.closest('.income-alloc-row').remove(); window.onAllocationRowAmountInput(); window.updateAllocationEmptyHint && window.updateAllocationEmptyHint();`;
  const amountDisplay = amountUsd ? `$${parseFloat(amountUsd).toFixed(2)}` : '$0.00';
  row.innerHTML = `
    <div class="data-card-top">
      <span class="data-card-title">${budgetName}</span>
      <span class="action-icon-group">${btnIconDelete(removeHandler, 'Remove')}</span>
    </div>
    ${cardRow('Budget Plan', budgetName)}
    ${cardRow('Amount (USD)', amountDisplay)}
  `;
  container.appendChild(row);
  updateAllocationEmptyHint();
}

window.updateAllocationEmptyHint = updateAllocationEmptyHint;

window.openAllocationEntryModal = async function(forEdit = false) {
  window._allocationModalForEdit = !!forEdit;
  const modal = document.getElementById('allocationEntryModal');
  const select = document.getElementById('allocModalBudget');
  const amount = document.getElementById('allocModalAmount');
  if (!modal || !select) return;

  const plans = await getBudgetPlansForTeam();
  select.innerHTML = '<option value="">Select Budget Plan</option>';
  plans.forEach(plan => {
    const status = getBudgetStatus(plan);
    if (status === 'approved' || status === 'paid' || status === 'received') {
      select.innerHTML += `<option value="${plan.id}">${plan.name} (${status})</option>`;
    }
  });
  if (amount) amount.value = '';
  modal.classList.add('active');
};

window.closeAllocationEntryModal = function() {
  document.getElementById('allocationEntryModal')?.classList.remove('active');
};

window.confirmAllocationEntry = async function() {
  const budgetId = document.getElementById('allocModalBudget')?.value;
  const amountUsd = parseFloat(document.getElementById('allocModalAmount')?.value) || 0;
  if (!budgetId || amountUsd <= 0) {
    showToast('Select a budget and enter an amount greater than zero.', 'warning');
    return;
  }
  const plans = await getBudgetPlansForTeam();
  const plan = plans.find(p => p.id === budgetId);
  const name = plan ? plan.name : 'Unknown Plan';
  const forEdit = !!window._allocationModalForEdit;
  const container = document.getElementById(forEdit ? 'editIncomeAllocationsContainer' : 'incomeAllocationsContainer');
  appendAllocationSummaryRow(container, budgetId, amountUsd, name, forEdit);
  window.closeAllocationEntryModal();
  if (forEdit) window.onEditIncomeMathChange();
  else window.onAllocationRowAmountInput();
};

window.addIncomeAllocationRow = async function(data = null) {
  const budgetId = data ? (data.budgetId || data.budget_id || '') : '';
  const amountUsd = data ? (data.amountUsd || data.amount_usd || '') : '';
  if (!budgetId) {
    window.openAllocationEntryModal(false);
    return;
  }
  const plans = await getBudgetPlansForTeam();
  const plan = plans.find(p => p.id === budgetId);
  appendAllocationSummaryRow(
    document.getElementById('incomeAllocationsContainer'),
    budgetId,
    amountUsd,
    plan ? plan.name : 'Budget',
    false
  );
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
    const budgetId = row.dataset.budgetId || row.querySelector('.alloc-budget-select')?.value;
    const amountUsd = parseFloat(row.dataset.amountUsd) || parseFloat(row.querySelector('.alloc-usd-input')?.value) || 0;
    if (budgetId && amountUsd > 0) {
      allocations.push({ budget_id: budgetId, amount_usd: amountUsd });
      totalAllocated += amountUsd;
    }
  });

  const teamId = state.currentTeam?.team_id;

  if (allocationsExceedIncome(totalAllocated, amount_usd)) {
    showToast('Cannot save. Allocations exceed your registered income amount.', 'error');
    return;
  }

  const unallocatedBudgetId = await ensureUnallocatedBudgetExists(teamId);
  if (totalAllocated < amount_usd && unallocatedBudgetId) {
    const remainder = amount_usd - totalAllocated;
    allocations.push({ budget_id: unallocatedBudgetId, amount_usd: remainder });
    totalAllocated = amount_usd;
  }

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
  if (!state.canManageIncome && !state.canViewTeamIncome) {
    return `
      <h1 class="page-title">Income Manager</h1>
      <div class="card">
        <h2>⛔ Access Denied</h2>
        <p>You do not have permission to view team income entries.</p>
      </div>
    `;
  }

  const readOnly = !state.canManageIncome;

  return `
    <h1 class="page-title">Income Manager</h1>
    ${readOnly ? '<p class="page-intro">Read-only view — team income ledger.</p>' : ''}
    <div class="card">
      <h2>🔍 Filter Transactions</h2>
      <div class="filter-section">
        <div class="form-stack">
          <div class="form-grid-row form-grid-row--filter-main">
            <div class="form-group"><label>Bucket</label><select id="filterIncBucket" onchange="window.initIncomeManagerPage()"><option value="all">All Accounts</option></select></div>
            <div class="form-group"><label>Budget</label><select id="filterIncBudget" onchange="window.initIncomeManagerPage()"><option value="all">All Budgets</option></select></div>
            <div class="form-group"><label>Type</label><select id="filterIncType" onchange="window.initIncomeManagerPage()"><option value="all">All</option><option value="budget_payment">Budget Funding</option><option value="manual">Regular Income</option></select></div>
            <div class="form-group"><label>Search</label><input type="text" id="filterIncFrom" placeholder="Budget, bucket, from…" oninput="window.initIncomeManagerPage()"></div>
          </div>
          <div class="form-grid-row form-grid-row--filter-dates">
            <div class="form-group"><label>From</label><input type="date" id="filterIncDateFrom" onchange="window.initIncomeManagerPage()"></div>
            <div class="form-group"><label>To</label><input type="date" id="filterIncDateTo" onchange="window.initIncomeManagerPage()"></div>
          </div>
        </div>
      </div>
    </div>

    <div class="card" id="pendingBudgetPaymentsCard" style="display:none; border-left: 4px solid var(--warning, #f59e0b);">
      <h2>📥 Pending Budget Payments</h2>
      <p class="page-intro">Installments sent by Finance that are awaiting your confirmation. Click <strong>Receive</strong> on a record to accept it into a bucket. Once received, it moves to the ledger below.</p>
      <div class="table-container show-desktop">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Budget</th>
              <th>Received From</th>
              <th>Amount (USD)</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="pendingPaymentsBody"></tbody>
        </table>
      </div>
      <div id="pendingPaymentsMobile" class="show-mobile data-card-list"></div>
    </div>

    <div class="card">
      <h2>📊 Historical Inflow Ledger</h2>
      <div class="table-container show-desktop">
        <table>
          <thead>
            <tr>
              <th>Ref</th>
              <th>Date</th>
              <th>Budget</th>
              <th>Received From</th>
              <th>Bucket</th>
              <th>Amount (USD)</th>
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
              <div class="form-group"><label class="required">Amount <span id="editIncCurrencyLabel" style="color: var(--primary);">(USD)</span></label><input type="number" class="input-amount" id="editIncAmount" step="0.01" required oninput="window.onEditIncomeMathChange()"></div>
              <div class="form-group"><label class="required">Bucket</label><select id="editIncBucketId" required onchange="window.onEditIncomeBucketChange(this)"><option value="">Loading…</option></select></div>
            </div>
            <div class="form-grid-row form-grid-row--income-edit-meta">
              <div class="form-group"><label>Date</label><input type="date" id="editIncDate" required></div>
              <div class="form-group"><label>Currency</label><input type="text" id="editIncCurrencyDisplay" readonly style="background:#f3f4f6;"></div>
              <div class="form-group"><label class="required" id="editIncExchangeRateLabel">Rate (1 USD = ?)</label><input type="number" class="input-rate" id="editIncExchangeRate" step="any" min="0.000001" required readonly oninput="window.onEditIncomeMathChange()"></div>
              <div class="form-group"><label id="editIncUsdEquivalentLabel">USD Equivalent</label><input type="number" class="input-amount" id="editIncLocalAmount" step="0.01" readonly style="background:#f3f4f6;"></div>
            </div>
            <div class="form-group"><label>Description</label><textarea id="editIncDescription" rows="2"></textarea></div>
          </div>

          <div class="btn-group">
            <button type="submit" class="success">Save Changes</button>
            <button type="button" class="secondary" onclick="window.closeEditIncomeModal()">Cancel</button>
          </div>
        </form>
      </div>
    </div>

    `;
}

export async function initIncomeManagerPage() {
  if (!state.canManageIncome && !state.canViewTeamIncome) return;

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
    teamBucketsCache.filter(b => b.is_active !== false).forEach(b => {
      filterSelect.innerHTML += `<option value="${b.id}">${b.name}</option>`;
    });
  }

  // Load income records from the server (falls back to local cache offline)
  // so system-generated receipts (created via RPC) always appear.
  const incResult = await sbSelect('income', { teamId, orderBy: 'date', ascending: false });
  if (incResult.error) {
    console.warn('Income load failed, using local cache:', incResult.error.message);
  }
  state.incomeRecords = (incResult.data || []).filter(i => !i.is_deleted);

  // Load budget plans for allocation name resolution
  let plans = state.budgetPlans || [];
  if (plans.length === 0) {
    const allPlans = await localGetAll('budget_plans');
    plans = allPlans.filter(p => p.team_id === teamId && !p.is_deleted);
    state.budgetPlans = plans;
  }

  // Populate budget filter dropdown from budget plans (new system:
  // income records carry budget_allocations with budget_id)
  const budgetFilter = document.getElementById('filterIncBudget');
  if (budgetFilter && budgetFilter.options.length <= 1) {
    budgetFilter.innerHTML = '<option value="all">All Budgets</option>' +
      plans
        .slice()
        .sort((a, b) => String(a.name).localeCompare(String(b.name)))
        .map(p => `<option value="${p.id}">${spEscapeHtml(p.name)}</option>`)
        .join('');
  }

  await renderPendingBudgetPayments(teamId);

  const filterBucketId = document.getElementById('filterIncBucket')?.value || 'all';
  const filterBudgetId = document.getElementById('filterIncBudget')?.value || 'all';
  const filterFrom = document.getElementById('filterIncFrom')?.value.toLowerCase().trim() || '';
  const filterType = document.getElementById('filterIncType')?.value || 'all';

  let records = [...(state.incomeRecords || [])];

  if (filterBucketId !== 'all') {
    records = records.filter(r => r.bucket_id === filterBucketId);
  }
  if (filterBudgetId !== 'all') {
    records = records.filter(r => (r.budget_allocations || []).some(a => a.budget_id === filterBudgetId));
  }
  if (filterFrom) {
    records = records.filter(r => {
      const hay = [
        r.payment_from || '',
        getBucketById(r.bucket_id)?.name || r.payment_bucket || '',
        ...(r.budget_allocations || []).map(a => plans.find(p => p.id === a.budget_id)?.name || '')
      ].join(' ').toLowerCase();
      return hay.includes(filterFrom);
    });
  }
  if (filterType !== 'all') {
    records = records.filter(r => incomeSourceOf(r) === filterType);
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
    let budgetCell = '<span style="color: #888;">Unallocated</span>';
    if (allocs.length > 0) {
      budgetCell = allocs.map(a => {
        const targetPlan = plans.find(p => p.id === a.budget_id);
        const name = targetPlan ? targetPlan.name : 'Unknown Plan';
        return `<div>${spEscapeHtml(name)}</div>`;
      }).join('');
    }
    const budgetPlain = allocs.length === 0
      ? 'Unallocated'
      : allocs.map(a => {
          const targetPlan = plans.find(p => p.id === a.budget_id);
          const name = targetPlan ? targetPlan.name : 'Unknown Plan';
          return name;
        }).join(' · ');

    // Resolve bucket name from cache
    const bucket = getBucketById(rec.bucket_id);
    const bucketName = bucket ? bucket.name : (rec.payment_bucket || 'Unknown');
    const bucketCurrency = bucket ? bucket.currency : (rec.currency || 'USD');

    const ref = rec.id ? String(rec.id).replace(/-/g, '').slice(0, 8).toUpperCase() : '—';
    const isSystem = incomeSourceOf(rec) === 'budget_payment';

    const actionButtons = (state.canManageIncome && !isSystem)
      ? `${btnIconEdit(`window.openEditIncomeRecord('${rec.id}')`)}${btnIconDelete(`window.deleteIncomeRecord('${rec.id}')`)}`
      : '—';

    tableHtml += `
      <tr>
        <td data-label="Ref" title="${spEscapeHtml(rec.id || '')}">${ref}</td>
        <td data-label="Date">${rec.date}</td>
        <td data-label="Budget">${budgetCell}</td>
        <td data-label="From">${rec.payment_from || 'Unknown'}</td>
        <td data-label="Bucket"><span class="badge badge-info">${spEscapeHtml(bucketName)}</span></td>
        <td data-label="USD">$${(rec.amount_usd || 0).toFixed(2)}</td>
        <td data-label="Actions" class="action-buttons">${actionButtons}</td>
      </tr>
    `;

    mobileHtml += `
      <article class="data-card data-card--compact">
        <div class="data-card-top">
          <span class="data-card-title">${spEscapeHtml(rec.payment_from || 'Unknown')}</span>
          ${state.canManageIncome && !isSystem ? `<span class="action-icon-group">${actionButtons}</span>` : ''}
        </div>
        ${cardRow('Ref', ref)}
        ${cardRow('Date', rec.date)}
        ${cardRow('Budget', budgetPlain)}
        ${cardRow('Bucket', `${bucketName} (${bucketCurrency})`)}
        ${cardRow('USD', `$${(rec.amount_usd || 0).toFixed(2)}`)}
      </article>
    `;
  });

  tbody.innerHTML = tableHtml;
  if (mobile) mobile.innerHTML = mobileHtml;
}

/** System-generated budget funding income vs manually entered income. */
function incomeSourceOf(rec) {
  if (rec.source) return rec.source === 'budget_payment' ? 'budget_payment' : 'manual';
  // Fallback for rows created before the source column existed
  const isSystem = rec.payment_from === 'KMOF / Budget Funding' ||
    String(rec.description || '').toLowerCase().startsWith('received funding for budget');
  return isSystem ? 'budget_payment' : 'manual';
}
// ==================== PENDING BUDGET PAYMENTS (per-record receipt) ====================

function spEscapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function renderPendingBudgetPayments(teamId) {
  const card = document.getElementById('pendingBudgetPaymentsCard');
  const tbody = document.getElementById('pendingPaymentsBody');
  const mobile = document.getElementById('pendingPaymentsMobile');
  if (!card || !tbody) return;

  let rows = [];
  try {
    const { data, error } = await supabaseClient
      .rpc('get_pending_budget_payment_list', { p_team_id: teamId });
    if (error) throw error;
    rows = data || [];
  } catch (err) {
    console.warn('Pending budget payments load failed:', err.message);
    card.style.display = 'none';
    return;
  }

  if (!rows.length) {
    card.style.display = 'none';
    return;
  }
  card.style.display = '';

  tbody.innerHTML = rows.map(r => `
    <tr>
      <td data-label="Date"><strong>${spEscapeHtml(r.transfer_date || '')}</strong></td>
      <td data-label="Budget">${spEscapeHtml(r.budget_name || 'Unknown budget')} <span class="form-hint">(${spEscapeHtml(r.budget_type || '')})</span></td>
      <td data-label="From">${spEscapeHtml(r.payer || 'KMOF / Finance')}</td>
      <td data-label="USD"><strong>$${Number(r.amount_usd || 0).toFixed(2)}</strong></td>
      <td data-label="Actions" class="action-buttons">
        <button type="button" class="small success" onclick="window.openReceivePaymentModal('${r.transfer_id}')">Receive</button>
      </td>
    </tr>
  `).join('');

  mobile.innerHTML = rows.map(r => `
    <article class="data-card data-card--compact">
      <div class="data-card-top">
        <span class="data-card-title">${spEscapeHtml(r.budget_name || 'Unknown budget')}</span>
        <button type="button" class="small success" onclick="window.openReceivePaymentModal('${r.transfer_id}')">Receive</button>
      </div>
      ${cardRow('Date', r.transfer_date || '')}
      ${cardRow('From', r.payer || 'KMOF / Finance')}
      ${cardRow('USD', `$${Number(r.amount_usd || 0).toFixed(2)}`)}
    </article>
  `).join('');
}

window.openReceivePaymentModal = async function (transferId) {
  if (teamBucketsCache.length === 0) await loadTeamBuckets();
  const buckets = teamBucketsCache.filter(b => !b.is_deleted);
  if (!buckets.length) {
    showToast('No active buckets found for this team. Please create a bucket first.', 'warning');
    return;
  }

  const existing = document.getElementById('receivePaymentModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'receivePaymentModal';
  modal.className = 'modal active';
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="modal-content small" style="max-width: 420px; padding: 20px;">
      <h3>📥 Receive Budget Payment</h3>
      <p style="font-size: 0.85rem; color: var(--text-secondary);">Select the bucket this installment should be allocated to.</p>
      <div class="form-stack" style="display: flex; flex-direction: column; gap: 12px;">
        <div class="form-group">
          <label style="font-weight: 600; font-size: 0.85rem;">Select Bucket</label>
          <select id="recvPayBucketSelect" style="width: 100%;">
            ${buckets.map(b => `<option value="${b.id}">${spEscapeHtml(b.name)} (${b.currency || 'USD'})</option>`).join('')}
          </select>
        </div>
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
          <button type="button" class="small" onclick="document.getElementById('receivePaymentModal').remove()">Cancel</button>
          <button type="button" id="recvPayConfirmBtn" class="small success">Confirm &amp; Receive</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('#recvPayConfirmBtn').onclick = async () => {
    const bucketId = modal.querySelector('#recvPayBucketSelect')?.value;
    const btn = modal.querySelector('#recvPayConfirmBtn');
    if (!bucketId) {
      showToast('Select a bucket.', 'warning');
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Receiving…';
    try {
      const { data, error } = await supabaseClient.rpc('accept_budget_payment_transfer', {
        p_transfer_id: transferId,
        p_bucket_id: bucketId,
        p_user_id: state.user?.id || null
      });
      if (error) throw error;
      showToast(`Received $${Number(data?.amount_usd || 0).toFixed(2)} into the bucket successfully!`, 'success');
      modal.remove();
      // Refresh ledger + pending list
      state.incomeRecords = [];
      await initIncomeManagerPage();
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Failed to receive payment', 'error');
      btn.disabled = false;
      btn.textContent = 'Confirm & Receive';
    }
  };
};

window.initIncomeManagerPage = initIncomeManagerPage;

window.openEditIncomeRecord = async function(id) {
  try {
    const rec = state.incomeRecords.find(r => r.id === id);
    if (!rec) {
      showToast('Income record not found.', 'error');
      return;
    }
    if (incomeSourceOf(rec) === 'budget_payment') {
      showToast('System-generated budget funding records cannot be edited.', 'warning');
      return;
    }

    if (teamBucketsCache.length === 0) await loadTeamBuckets();
    if (exchangeRatesCache.length === 0) await loadExchangeRates();

    document.getElementById('editIncId').value = rec.id;
    document.getElementById('editIncDate').value = rec.date;
    document.getElementById('editIncPaymentFrom').value = rec.payment_from || '';

        const bucketSelect = document.getElementById('editIncBucketId');
    bucketSelect.innerHTML = '<option value="">Select Bucket</option>';
    const unallocated = teamBucketsCache.find(b => b.name === 'General Funds (Unallocated)' || b.is_system_bucket);
    if (unallocated) {
      bucketSelect.innerHTML += '<option value="' + unallocated.id + '" data-currency="' + unallocated.currency + '">' + unallocated.name + ' (' + unallocated.currency + ')</option>';
      bucketSelect.value = unallocated.id;
    } else {
      teamBucketsCache.filter(b => b.is_active !== false).forEach(b => {
        bucketSelect.innerHTML += '<option value="' + b.id + '" data-currency="' + b.currency + '">' + b.name + ' (' + b.currency + ')</option>';
      });
      bucketSelect.value = rec.bucket_id || '';
    }

    document.getElementById('editIncAmount').value = bucketAmountForEdit(rec);
    document.getElementById('editIncExchangeRate').value = rateForInput(rec.exchange_rate || 1);
    document.getElementById('editIncDescription').value = rec.description || '';

    window.onEditIncomeBucketChange(bucketSelect, { preserveRate: true });

    window.onEditIncomeMathChange();

/*     const container = document.getElementById('editIncomeAllocationsContainer');
    container.innerHTML = '';
    const plans = await getBudgetPlansForTeam();
    const allocs = rec.budget_allocations || [];
    allocs.forEach(a => {
      const plan = plans.find(p => p.id === a.budget_id);
      appendAllocationSummaryRow(container, a.budget_id, a.amount_usd, plan ? plan.name : 'Unknown Plan', true);
    }); */

    document.getElementById('editIncomeModal').classList.add('active');
  } catch (err) {
    console.error('Open edit income error:', err);
    showToast(err.message || 'Could not open edit form.', 'error');
  }
};

window.onEditIncomeBucketChange = function(selectEl, options = {}) {
  const preserveRate = options.preserveRate === true;
  const bucketId = selectEl.value;
  const bucket = getBucketById(bucketId);

  const currencyDisplay = document.getElementById('editIncCurrencyDisplay');
  const rateInput = document.getElementById('editIncExchangeRate');
  const rateLabel = document.getElementById('editIncExchangeRateLabel');

  if (!bucket) {
    if (currencyDisplay) currencyDisplay.value = 'USD';
    updateIncomeAmountCurrencyLabel('USD', 'editIncCurrencyLabel');
    return;
  }

  const currency = bucket.currency || 'USD';
  if (currencyDisplay) currencyDisplay.value = currency;
  updateIncomeAmountCurrencyLabel(currency, 'editIncCurrencyLabel');

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
  if (data?.budget_id || data?.budgetId) {
    const plans = await getBudgetPlansForTeam();
    const budgetId = data.budget_id || data.budgetId;
    const plan = plans.find(p => p.id === budgetId);
    appendAllocationSummaryRow(
      document.getElementById('editIncomeAllocationsContainer'),
      budgetId,
      data.amount_usd || data.amountUsd || '',
      plan ? plan.name : 'Unknown Plan',
      true
    );
    window.onEditIncomeMathChange();
    return;
  }
  window.openAllocationEntryModal(true);
};

window.onEditIncomeMathChange = function() {
  const amount = parseFloat(document.getElementById('editIncAmount').value) || 0;
  const rate = parseFloat(document.getElementById('editIncExchangeRate').value) || 0;
  const localInput = document.getElementById('editIncLocalAmount');

  if (localInput) {
    if (amount > 0 && rate > 0) {
      localInput.value = formatUsdDisplay(localToUsd(amount, rate));
    } else {
      localInput.value = '';
    }
  }

  const bucketId = document.getElementById('editIncBucketId')?.value;
  const incomeUsd = getIncomeUsdEquivalent('editIncAmount', 'editIncExchangeRate', bucketId);

  const rows = document.querySelectorAll('#editIncomeAllocationsContainer .income-alloc-row');
  let allocated = 0;
  rows.forEach(row => {
    allocated += parseFloat(row.dataset.amountUsd) || parseFloat(row.querySelector('.edit-alloc-usd-input')?.value) || 0;
  });

  /* document.getElementById('lblEditTotalIncome').textContent = formatUsdDisplay(incomeUsd);
  document.getElementById('lblEditAllocated').textContent = allocated.toFixed(2);

  const unallocated = incomeUsd - allocated;
  const unallocEl = document.getElementById('lblEditUnallocated');
  unallocEl.textContent = unallocated.toFixed(2);
  const unallocRow = unallocEl.closest('.data-card-row-value');
  if (unallocRow) {
    unallocRow.classList.toggle('negative', unallocated < 0);
    unallocRow.classList.toggle('positive', unallocated >= 0);
   */
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
    const bId = row.dataset.budgetId || row.querySelector('.edit-alloc-budget-select')?.value;
    const amt = parseFloat(row.dataset.amountUsd) || parseFloat(row.querySelector('.edit-alloc-usd-input')?.value) || 0;
    if (bId && amt > 0) {
      allocations.push({ budget_id: bId, amount_usd: amt });
      totalAllocated += amt;
    }
  });

  const teamId = state.currentTeam?.team_id;

  if (allocationsExceedIncome(totalAllocated, amount_usd)) {
    showToast('Allocations exceed total income value!', 'error');
    return;
  }

  const unallocatedBudgetId = await ensureUnallocatedBudgetExists(teamId);
  if (totalAllocated < amount_usd && unallocatedBudgetId) {
    const remainder = amount_usd - totalAllocated;
    allocations.push({ budget_id: unallocatedBudgetId, amount_usd: remainder });
    totalAllocated = amount_usd;
  }

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
  showConfirm(
    'Are you sure you want to delete this income entry? Allocations tied to it will clear.',
    async () => {
      const existing = state.incomeRecords.find(r => r.id === id);
      if (existing && incomeSourceOf(existing) === 'budget_payment') {
        showToast('System-generated budget funding records cannot be deleted.', 'warning');
        return;
      }

      try {
        const result = await sbSoftDelete('income', id);
        if (result && result.error) throw new Error(result.error.message);

        const teamId = state.currentTeam?.team_id;
        state.incomeRecords = [];
        const all = await localGetAll('income');
        state.incomeRecords = all.filter(i => i.team_id === teamId && !i.is_deleted);

        await auditLog('DELETE', 'income', id, existing, null);

        showToast('Income record removed.', 'success');
        initIncomeManagerPage();
      } catch (err) {
        console.error('Delete income error:', err);
        showToast('Failed to drop record', 'error');
      }
    }
  );
};

window.closeEditIncomeModal = function() {
  document.getElementById('editIncomeModal').classList.remove('active');
};
