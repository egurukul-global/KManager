/* ========== EXPENSES MODULE ========== */
import { state } from '../state.js';
import {
  localGetAll,
  localPut,
  sbInsert,
  sbUpdate,
  sbSoftDelete,
  sbSelect,
  supabaseClient
} from '../db.js';
import { showToast, showConfirm } from '../components/toasts.js';
import {
  buildExpenseRateOptions,
  buildExpensePayload,
  calculateExpenseUsd,
  checkBudgetOvershoot,
  checkBucketOverdrawn,
  getBudgetCategoryOptions,
  getExpenseCategoryLabel,
  resolveExpenseRate
} from '../utils/expenseHelpers.js';
import {
  getUserTeamDefaults,
  saveUserTeamDefaults,
  clearUserTeamDefaults,
  loadUserTeamDefaultsForCurrentTeam
} from '../utils/userTeamDefaults.js';
import { formatUsdDisplay, normalizeUsdMultiplierRate, rateForInput } from '../utils/currency.js';

let teamBucketsCache = [];
let teamBudgetsCache = [];
let teamCategoriesCache = [];
let exchangeRatesCache = [];
let teamExpensesCache = [];
let pendingExpensePayload = null;
let selectedExpenseIds = new Set();

function canViewAllExpenses() {
  return state.canViewAllExpenses;
}

function canEditExpense(expense) {
  if (!state.canManageExpenses) return false;
  if (canViewAllExpenses()) return true;
  return expense.created_by === state.user?.id;
}

async function loadTeamBuckets() {
  const teamId = state.currentTeam?.team_id;
  if (!teamId) return [];
  const result = await sbSelect('buckets', { teamId, orderBy: 'name', ascending: true });
  teamBucketsCache = (result.data || []).filter(b => !b.is_deleted);
  return teamBucketsCache;
}

function parseBudgetCategories(raw) {
  if (!raw) return [];
  let cats = raw;
  if (typeof cats === 'string') {
    try {
      cats = JSON.parse(cats);
    } catch {
      return [];
    }
  }
  return Array.isArray(cats) ? cats : [];
}

function normalizeBudgetRecord(budget) {
  if (!budget) return budget;
  return { ...budget, categories: parseBudgetCategories(budget.categories) };
}

async function loadTeamBudgets() {
  const teamId = state.currentTeam?.team_id;
  if (!teamId) return [];
  const result = await sbSelect('budget_plans', { teamId, orderBy: 'name', ascending: true });
  teamBudgetsCache = (result.data || []).filter(b => !b.is_deleted).map(normalizeBudgetRecord);
  return teamBudgetsCache;
}

async function loadTeamCategories() {
  const teamId = state.currentTeam?.team_id;
  if (!teamId) return [];
  const result = await sbSelect('categories', { teamId, orderBy: 'name', ascending: true });
  teamCategoriesCache = (result.data || []).filter(c => !c.is_deleted);
  return teamCategoriesCache;
}

async function loadExchangeRates() {
  const teamId = state.currentTeam?.team_id;
  if (!teamId) return [];
  const result = await sbSelect('exchange_rates', { teamId, orderBy: 'date', ascending: false });
  exchangeRatesCache = (result.data || []).filter(r => !r.is_deleted);
  return exchangeRatesCache;
}

async function loadTeamExpenses() {
  const teamId = state.currentTeam?.team_id;
  if (!teamId) return [];
  const result = await sbSelect('expenses', { teamId, orderBy: 'date', ascending: false });
  let rows = (result.data || []).filter(e => !e.is_deleted);
  if (!canViewAllExpenses()) {
    rows = rows.filter(e => e.created_by === state.user?.id);
  }
  teamExpensesCache = rows;
  return teamExpensesCache;
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

function getBudgetById(id) {
  return teamBudgetsCache.find(b => b.id === id);
}

function getBucketById(id) {
  return teamBucketsCache.find(b => b.id === id);
}

function populateBudgetSelect(selectEl, currentOnly = true) {
  if (!selectEl) return;
  const current = selectEl.value;
  selectEl.innerHTML = '<option value="">Select budget</option>';
  teamBudgetsCache.forEach(b => {
    if (currentOnly && (b.status || 'current') !== 'current') return;
    selectEl.innerHTML += `<option value="${b.id}">${b.name}</option>`;
  });
  if (current) selectEl.value = current;
}

function populateBucketSelect(selectEl) {
  if (!selectEl) return;
  const current = selectEl.value;
  selectEl.innerHTML = '<option value="">Select bucket</option>';
  teamBucketsCache.forEach(b => {
    selectEl.innerHTML += `<option value="${b.id}">${b.name} (${b.currency})</option>`;
  });
  if (current) selectEl.value = current;
}

function populateCurrencySelect(selectEl) {
  if (!selectEl) return;
  const currencies = new Set(['USD']);
  exchangeRatesCache.forEach(r => {
    const n = r.to_currency || r.from_currency;
    if (n && n !== 'USD') currencies.add(n);
  });
  teamBucketsCache.forEach(b => { if (b.currency) currencies.add(b.currency); });
  const current = selectEl.value;
  selectEl.innerHTML = '<option value="">Select currency</option>';
  [...currencies].sort().forEach(c => {
    selectEl.innerHTML += `<option value="${c}">${c}</option>`;
  });
  if (current) selectEl.value = current;
}

function updateCategorySelect(selectEl, budgetId) {
  if (!selectEl) return;
  const budget = getBudgetById(budgetId);
  selectEl.innerHTML = '<option value="">Select category</option>';
  if (!budget) return;
  getBudgetCategoryOptions(budget, teamCategoriesCache).forEach(opt => {
    selectEl.innerHTML += `<option value="${opt.value}" data-category-id="${opt.categoryId || ''}" data-label="${opt.label.replace(/"/g, '&quot;')}" data-budgeted="${opt.budgetedUsd}">${opt.label}</option>`;
  });
}

function updateRateSelect(selectEl, manualEl, currency, usdEl, localEl) {
  if (!selectEl) return;
  const options = buildExpenseRateOptions(exchangeRatesCache, currency);
  selectEl.innerHTML = '<option value="">Select rate</option>';
  options.forEach(opt => {
    selectEl.innerHTML += `<option value="${opt.value}">${opt.label}</option>`;
  });
  if (currency === 'USD') {
    if (manualEl) manualEl.value = '1';
    if (options.length) selectEl.value = '1';
  } else if (options.length === 1) {
    selectEl.value = options[0].value;
  } else if (options.length > 1) {
    selectEl.value = options[0].value;
  } else if (manualEl && currency) {
    const latest = resolveExpenseRate(currency, '', '', exchangeRatesCache);
    if (latest > 0) manualEl.value = String(latest);
  }
  recalcExpenseUsd(usdEl, localEl, currency, selectEl, manualEl);
}

function recalcExpenseUsd(usdEl, localEl, currency, rateSelectEl, rateManualEl) {
  if (!usdEl || !localEl) return;
  const local = parseFloat(localEl.value) || 0;
  const rate = resolveExpenseRate(
    currency,
    rateSelectEl?.value,
    rateManualEl?.value,
    exchangeRatesCache
  );
  usdEl.value = local > 0 && rate > 0 ? formatUsdDisplay(calculateExpenseUsd(local, currency, rate)) : '';
}

function getCategoryOptionFromSelect(selectEl) {
  const opt = selectEl?.selectedOptions?.[0];
  if (!opt?.value) return null;
  return {
    value: opt.value,
    label: opt.dataset.label || opt.textContent,
    categoryId: opt.dataset.categoryId || null,
    budgetedUsd: parseFloat(opt.dataset.budgeted) || 0
  };
}

function showExpenseWarningModal(contentHtml, onConfirm) {
  let modal = document.getElementById('expenseWarningModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'expenseWarningModal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content small">
        <button type="button" class="close-modal" onclick="window.closeExpenseWarningModal()">&times;</button>
        <h2>⚠️ Confirm expense</h2>
        <div id="expenseWarningContent"></div>
        <div class="btn-group" style="margin-top:16px;">
          <button type="button" class="danger" id="expenseWarningConfirmBtn">Proceed anyway</button>
          <button type="button" class="secondary" onclick="window.closeExpenseWarningModal()">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }
  document.getElementById('expenseWarningContent').innerHTML = contentHtml;
  const confirmBtn = document.getElementById('expenseWarningConfirmBtn');
  confirmBtn.onclick = () => {
    window.closeExpenseWarningModal();
    onConfirm();
  };
  modal.classList.add('active');
}

window.closeExpenseWarningModal = function() {
  document.getElementById('expenseWarningModal')?.classList.remove('active');
  pendingExpensePayload = null;
};

async function saveExpenseRecord(payload, isEdit = false, existingId = null) {
  try {
    let result;
    if (isEdit && existingId) {
      payload.id = existingId;
      result = await sbUpdate('expenses', payload, { id: existingId });
    } else {
      payload.id = crypto.randomUUID();
      payload.created_at = new Date().toISOString();
      result = await sbInsert('expenses', payload);
    }
    if (result?.error) throw result.error;

    const saved = result.data?.[0] || payload;
    await localPut('expenses', saved);
    await auditLog(isEdit ? 'UPDATE' : 'INSERT', 'expenses', saved.id, null, saved);
    await loadTeamExpenses();
    return saved;
  } catch (err) {
    console.error('Save expense error:', err);
    throw err;
  }
}

function validateAndWarnExpense(payload, excludeId, onSuccess) {
  const budget = getBudgetById(payload.budget_id);
  const bucket = getBucketById(payload.bucket_id);
  const categoryLabel = payload.vendor_info?.replace('budget_cat:', '') || '';
  const categoryOption = {
    label: categoryLabel,
    categoryId: payload.category_id,
    budgetedUsd: (budget?.categories || []).find(c => {
      const n = c.name || c.category;
      return n === categoryLabel || `${n} — ${c.subcategory}` === categoryLabel;
    })?.usdAmount || 0
  };

  if (budget && categoryLabel) {
    const lines = getBudgetCategoryOptions(budget, teamCategoriesCache);
    const match = lines.find(l => l.label === categoryLabel);
    if (match) categoryOption.budgetedUsd = match.budgetedUsd;
  }

  const budgetCheck = checkBudgetOvershoot({
    expenses: teamExpensesCache,
    budget,
    categoryOption,
    usdAmount: payload.usd_amount,
    excludeId
  });
  const bucketCheck = checkBucketOverdrawn(bucket, payload.usd_amount, exchangeRatesCache);

  if (!budgetCheck.overshoot && !bucketCheck.overdrawn) {
    onSuccess();
    return;
  }

  let html = '';
  if (budgetCheck.overshoot) {
    html += `
      <div style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--border);">
        <p><strong>Budget overshoot</strong></p>
        <p>${budgetCheck.budgetName} · ${budgetCheck.category}</p>
        <p>Budgeted: $${budgetCheck.budgeted.toFixed(2)} · Spent: $${budgetCheck.spent.toFixed(2)}</p>
        <p style="color:var(--danger);font-weight:600;">Over by $${budgetCheck.overBy.toFixed(2)}</p>
      </div>`;
  }
  if (bucketCheck.overdrawn) {
    html += `
      <div>
        <p><strong>Bucket overdrawn</strong></p>
        <p>${bucketCheck.bucketName} · Balance ≈ $${bucketCheck.bucketUsd.toFixed(2)} USD</p>
        <p style="color:var(--danger);font-weight:600;">Shortfall: $${bucketCheck.shortfall.toFixed(2)}</p>
      </div>`;
  }

  pendingExpensePayload = payload;
  showExpenseWarningModal(html, onSuccess);
}

// ========== ADD EXPENSE ==========

export function getAddExpensePage() {
  if (!state.canManageExpenses) {
    return `
      <h1 class="page-title">Add Expense</h1>
      <div class="card"><h2>⛔ Access Denied</h2><p>You do not have permission to record expenses.</p></div>
    `;
  }

  return `
    <h1 class="page-title">Add Expense</h1>
    <details class="card" style="margin-bottom:16px;">
      <summary style="cursor:pointer;font-weight:600;">⚙️ My defaults <span id="expenseDefaultsSummary" style="font-weight:normal;color:#666;font-size:0.85em;"></span></summary>
      <p style="margin:12px 0;color:var(--text-secondary);font-size:0.9em;">
        Saved to your account for this team — syncs across devices. Pre-fills Expense, Income, and Transfer. Date always defaults to today.
      </p>
      <div class="form-stack">
        <div class="form-grid-row form-grid-row--defaults">
          <div class="form-group"><label>Default budget</label><select id="defExpBudget" onchange="window.updateDefExpenseCategories()"><option value="">None</option></select></div>
          <div class="form-group"><label>Default category</label><select id="defExpCategory"><option value="">Select budget first</option></select></div>
          <div class="form-group"><label>Default bucket</label><select id="defExpBucket"><option value="">None</option></select></div>
          <div class="form-group"><label>Default currency</label><select id="defExpCurrency" onchange="window.updateDefRateDropdown()"><option value="">—</option></select></div>
        </div>
      </div>
      <div class="btn-group">
        <button type="button" class="secondary" onclick="window.saveExpenseDefaultsFromPanel()">Save defaults</button>
        <button type="button" class="secondary" onclick="window.clearExpenseDefaultsPanel()">Clear</button>
      </div>
    </details>
    <div class="card">
      <h2>📝 New expense</h2>
      <form id="expenseForm">
        <div class="form-stack">
          <div class="form-grid-row form-grid-row--expense-header">
            <div class="form-group"><label>Date</label><input type="date" name="date" id="expDate" required></div>
            <div class="form-group"><label>Budget</label><select name="budget_id" id="expBudget" required onchange="window.onExpenseBudgetChange()"><option value="">Select budget</option></select></div>
            <div class="form-group"><label>Category</label><select name="category" id="expCategory" required><option value="">Select budget first</option></select></div>
            <div class="form-group"><label>Payment bucket</label><select name="bucket_id" id="expBucket" required onchange="window.onExpenseBucketChange()"><option value="">Select bucket</option></select></div>
          </div>
          <div class="form-grid-row form-grid-row--expense-chunk">
            <div class="form-group"><label class="required">Item</label><input type="text" name="item" id="expItem" required placeholder="e.g. Groceries"></div>
            <div class="form-group"><label class="required">Local amount</label><input type="number" class="input-amount" name="local_amount" id="expLocalAmount" step="0.01" min="0" required oninput="window.onExpenseMathChange()"></div>
            <div class="form-group"><label>Currency</label><select name="currency" id="expCurrency" required onchange="window.onExpenseCurrencyChange()"><option value="">—</option></select></div>
          </div>
          <div class="form-grid-row form-grid-row--expense-money">
            <div class="form-group"><label>Rate (1 USD = ?)</label><select name="rate_select" id="expRateSelect" onchange="window.onExpenseMathChange()"><option value="">Rate</option></select></div>
            <div class="form-group"><label>Manual</label><input type="number" class="input-rate" name="rate_manual" id="expRateManual" step="any" placeholder="Rate" oninput="window.onExpenseMathChange()"></div>
            <div class="form-group"><label>USD</label><input type="number" class="input-amount" id="expUSD" step="0.01" readonly></div>
          </div>
          <div class="form-group form-span-full"><label class="required" for="expReceiptUrl">Receipt URL</label><input type="url" name="receipt_url" id="expReceiptUrl" placeholder="https://..." required></div>
          <div class="form-group form-span-full"><label for="expDescription">Notes</label><textarea name="description" id="expDescription" rows="2" placeholder="Optional notes"></textarea></div>
        </div>
        <div class="btn-group"><button type="submit">Add expense</button></div>
      </form>
    </div>
  `;
}

export async function initAddExpensePage() {
  if (!state.canManageExpenses) return;

  await Promise.all([
    loadTeamBuckets(),
    loadTeamBudgets(),
    loadTeamCategories(),
    loadExchangeRates(),
    loadTeamExpenses()
  ]);

  const dateEl = document.getElementById('expDate');
  if (dateEl) dateEl.valueAsDate = new Date();

  window.onExpenseBudgetChange = () => {
    updateCategorySelect(document.getElementById('expCategory'), document.getElementById('expBudget')?.value);
  };
  window.onExpenseBucketChange = () => {
    const bucket = getBucketById(document.getElementById('expBucket')?.value);
    if (bucket?.currency) {
      document.getElementById('expCurrency').value = bucket.currency;
      window.onExpenseCurrencyChange();
    }
  };
  window.onExpenseCurrencyChange = () => {
    updateRateSelect(
      document.getElementById('expRateSelect'),
      document.getElementById('expRateManual'),
      document.getElementById('expCurrency')?.value,
      document.getElementById('expUSD'),
      document.getElementById('expLocalAmount')
    );
  };
  window.onExpenseMathChange = () => {
    recalcExpenseUsd(
      document.getElementById('expUSD'),
      document.getElementById('expLocalAmount'),
      document.getElementById('expCurrency')?.value,
      document.getElementById('expRateSelect'),
      document.getElementById('expRateManual')
    );
  };
  window.updateDefExpenseCategories = () => {
    updateCategorySelect(document.getElementById('defExpCategory'), document.getElementById('defExpBudget')?.value);
  };
  window.updateDefRateDropdown = () => {};
  window.saveExpenseDefaultsFromPanel = saveExpenseDefaultsFromPanel;
  window.clearExpenseDefaultsPanel = clearExpenseDefaultsPanel;

  populateBudgetSelect(document.getElementById('expBudget'), true);
  populateBudgetSelect(document.getElementById('defExpBudget'), true);
  populateBucketSelect(document.getElementById('expBucket'));
  populateBucketSelect(document.getElementById('defExpBucket'));
  populateCurrencySelect(document.getElementById('expCurrency'));
  populateCurrencySelect(document.getElementById('defExpCurrency'));

  await loadUserTeamDefaultsForCurrentTeam();
  applyExpenseDefaults();

  const itemEl = document.getElementById('expItem');
  if (itemEl) setTimeout(() => itemEl.focus(), 100);

  const form = document.getElementById('expenseForm');
  form?.addEventListener('submit', handleAddExpenseSubmit);
}

function updateExpenseDefaultsSummary() {
  const el = document.getElementById('expenseDefaultsSummary');
  if (!el) return;
  const defs = getUserTeamDefaults();
  const parts = [];
  if (defs.budget_id) parts.push(getBudgetById(defs.budget_id)?.name || 'Budget');
  if (defs.category_label) parts.push(defs.category_label);
  if (defs.bucket_id) parts.push(getBucketById(defs.bucket_id)?.name || 'Bucket');
  el.textContent = parts.length ? `— ${parts.join(' · ')}` : '— none set';
}

function applyExpenseDefaults() {
  const defs = getUserTeamDefaults();

  if (defs.budget_id) {
    const defBudget = document.getElementById('defExpBudget');
    if (defBudget) defBudget.value = defs.budget_id;
    window.updateDefExpenseCategories?.();
    if (defs.category_value) {
      const defCat = document.getElementById('defExpCategory');
      if (defCat) defCat.value = defs.category_value;
    }
  }

  if (defs.bucket_id) {
    const defBucket = document.getElementById('defExpBucket');
    if (defBucket) defBucket.value = defs.bucket_id;
  }
  if (defs.currency) {
    const defCurrency = document.getElementById('defExpCurrency');
    if (defCurrency) defCurrency.value = defs.currency;
  }

  if (defs.budget_id) {
    document.getElementById('expBudget').value = defs.budget_id;
    window.onExpenseBudgetChange?.();
    if (defs.category_value) {
      document.getElementById('expCategory').value = defs.category_value;
    }
  }
  if (defs.bucket_id) {
    document.getElementById('expBucket').value = defs.bucket_id;
    window.onExpenseBucketChange?.();
  } else if (defs.currency) {
    document.getElementById('expCurrency').value = defs.currency;
    window.onExpenseCurrencyChange?.();
  }

  updateExpenseDefaultsSummary();
}

async function saveExpenseDefaultsFromPanel() {
  const catSelect = document.getElementById('defExpCategory');
  const opt = catSelect?.selectedOptions?.[0];
  try {
    await saveUserTeamDefaults({
      budget_id: document.getElementById('defExpBudget')?.value || '',
      category_value: catSelect?.value || '',
      category_label: opt?.dataset?.label || opt?.textContent?.trim() || '',
      bucket_id: document.getElementById('defExpBucket')?.value || '',
      currency: document.getElementById('defExpCurrency')?.value || ''
    });
    applyExpenseDefaults();
    showToast('Defaults saved to your account', 'success');
  } catch (err) {
    showToast(err.message || 'Failed to save defaults', 'error');
  }
}

async function clearExpenseDefaultsPanel() {
  try {
    await clearUserTeamDefaults();
    ['defExpBudget', 'defExpCategory', 'defExpBucket', 'defExpCurrency'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    updateExpenseDefaultsSummary();
    showToast('Defaults cleared', 'success');
  } catch (err) {
    showToast(err.message || 'Failed to clear defaults', 'error');
  }
}

async function handleAddExpenseSubmit(e) {
  e.preventDefault();
  const form = e.target;
  form._rates = exchangeRatesCache;

  const currency = document.getElementById('expCurrency')?.value;
  const rate = resolveExpenseRate(
    currency,
    document.getElementById('expRateSelect')?.value,
    document.getElementById('expRateManual')?.value,
    exchangeRatesCache
  );
  if (!rate || rate <= 0) {
    showToast('Please select or enter a valid exchange rate', 'error');
    return;
  }

  const payload = buildExpensePayload(form, state.currentTeam.team_id, state.user.id);
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;

  validateAndWarnExpense(payload, null, async () => {
    try {
      await saveExpenseRecord(payload, false);
      showToast('Expense added', 'success');
      form.reset();
      document.getElementById('expDate').valueAsDate = new Date();
      applyExpenseDefaults();
      window.showPage('expense-manager');
    } catch (err) {
      showToast(err.message || 'Failed to save expense', 'error');
    } finally {
      btn.disabled = false;
    }
  });

  btn.disabled = false;
}

// ========== EXPENSE MANAGER ==========

export function getExpenseManagerPage() {
  if (!state.canManageExpenses) {
    return `
      <h1 class="page-title">Expense Manager</h1>
      <div class="card"><h2>⛔ Access Denied</h2><p>You do not have permission to view expenses.</p></div>
    `;
  }

  const scopeNote = canViewAllExpenses()
    ? 'Showing all team expenses.'
    : 'Showing your expenses only. Team lead sees all team entries.';

  return `
    <h1 class="page-title">Expense Manager</h1>
    <div class="card">
      <p style="color:var(--text-secondary);margin-bottom:16px;">${scopeNote}</p>
      <div class="filter-section">
        <div class="form-stack">
          <div class="form-grid-row form-grid-row--filter-main">
            <div class="form-group"><label>Budget</label><select id="expFilterBudget" onchange="window.onExpenseBudgetFilterChange()"><option value="">All</option></select></div>
            <div class="form-group"><label>Category</label><select id="expFilterCategory" onchange="window.refreshExpenseList()"><option value="">All</option></select></div>
            <div class="form-group"><label>Bucket</label><select id="expFilterBucket" onchange="window.refreshExpenseList()"><option value="">All</option></select></div>
          </div>
          <div class="form-grid-row form-grid-row--filter-dates">
            <div class="form-group"><label>From</label><input type="date" id="expFilterStart" onchange="window.refreshExpenseList()"></div>
            <div class="form-group"><label>To</label><input type="date" id="expFilterEnd" onchange="window.refreshExpenseList()"></div>
          </div>
        </div>
        <button type="button" class="secondary" style="margin-top:12px;" onclick="window.resetExpenseFilters()">Reset filters</button>
      </div>
      <div class="bulk-actions" id="expBulkActions">
        <span id="expSelectedCount">0 selected</span>
        <button type="button" class="info" id="expEditSelectedBtn" disabled onclick="window.editSelectedExpense()">Edit selected</button>
        <button type="button" class="danger" onclick="window.deleteSelectedExpenses()">Delete selected</button>
        <button type="button" class="secondary" onclick="window.clearExpenseSelection()">Clear</button>
      </div>
      <h3>Expenses <span id="expenseCount" style="font-size:0.85em;color:#666;font-weight:normal;"></span></h3>
      <div class="table-container show-desktop">
        <table>
          <thead>
            <tr>
              <th class="checkbox-col"><input type="checkbox" onchange="window.toggleSelectAllExpenses(this)"></th>
              <th>Date</th><th>Item</th><th>Budget</th><th>Category</th><th>Bucket</th>
              <th>Local</th><th>USD</th><th>Receipt</th><th>Actions</th>
            </tr>
          </thead>
          <tbody id="expenseTableBody"></tbody>
        </table>
      </div>
      <div id="expenseMobileList" class="show-mobile data-card-list"></div>
      <div id="expenseEmpty" class="empty-state" style="display:none;">No expenses match your filters.</div>
    </div>
    <div id="editExpenseModal" class="modal">
      <div class="modal-content" style="max-width:900px;">
        <button type="button" class="close-modal" onclick="window.closeEditExpenseModal()">&times;</button>
        <h2>Edit expense</h2>
        <form id="editExpenseForm">
          <input type="hidden" id="editExpId">
          <div class="form-stack">
            <div class="form-grid-row form-grid-row--expense-header">
              <div class="form-group"><label class="required">Date</label><input type="date" name="date" id="editExpDate" required></div>
              <div class="form-group"><label class="required">Budget</label><select name="budget_id" id="editExpBudget" required onchange="window.onEditExpenseBudgetChange()"></select></div>
              <div class="form-group"><label class="required">Category</label><select id="editExpCategory" name="category" required></select></div>
              <div class="form-group"><label class="required">Bucket</label><select id="editExpBucket" name="bucket_id" required onchange="window.onEditExpenseBucketChange()"></select></div>
            </div>
            <div class="form-grid-row form-grid-row--expense-chunk">
              <div class="form-group"><label class="required">Item</label><input type="text" name="item" id="editExpItem" required></div>
              <div class="form-group"><label class="required">Local amount</label><input type="number" class="input-amount" name="local_amount" id="editExpLocalAmount" step="0.01" required oninput="window.onEditExpenseMathChange()"></div>
              <div class="form-group"><label class="required">Currency</label><select id="editExpCurrency" name="currency" required onchange="window.onEditExpenseCurrencyChange()"></select></div>
            </div>
            <div class="form-grid-row form-grid-row--expense-money">
              <div class="form-group"><label>Rate</label><select id="editExpRateSelect" name="rate_select" onchange="window.onEditExpenseMathChange()"></select></div>
              <div class="form-group"><label>Manual</label><input type="number" class="input-rate" id="editExpRateManual" name="rate_manual" step="any" oninput="window.onEditExpenseMathChange()"></div>
              <div class="form-group"><label>USD</label><input type="number" class="input-amount" id="editExpUSD" readonly></div>
            </div>
            <div class="form-group form-span-full"><label class="required">Receipt URL</label><input type="url" id="editExpReceiptUrl" name="receipt_url" required></div>
            <div class="form-group form-span-full"><label>Notes</label><textarea id="editExpDescription" name="description" rows="2"></textarea></div>
          </div>
          <div class="btn-group">
            <button type="submit" class="success">Save changes</button>
            <button type="button" class="secondary" onclick="window.closeEditExpenseModal()">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

export async function initExpenseManagerPage() {
  if (!state.canManageExpenses) return;

  await Promise.all([
    loadTeamBuckets(),
    loadTeamBudgets(),
    loadTeamCategories(),
    loadExchangeRates(),
    loadTeamExpenses()
  ]);

  populateBudgetSelect(document.getElementById('expFilterBudget'), false);
  const bucketFilter = document.getElementById('expFilterBucket');
  bucketFilter.innerHTML = '<option value="">All</option>';
  teamBucketsCache.forEach(b => {
    bucketFilter.innerHTML += `<option value="${b.id}">${b.name}</option>`;
  });

  populateExpenseCategoryFilter();

  document.getElementById('editExpenseForm')?.addEventListener('submit', handleEditExpenseSubmit);

  window.onExpenseBudgetFilterChange = () => {
    populateExpenseCategoryFilter(document.getElementById('expFilterBudget')?.value || '');
    refreshExpenseList();
  };
  window.refreshExpenseList = refreshExpenseList;
  window.resetExpenseFilters = resetExpenseFilters;
  window.toggleExpenseSelection = toggleExpenseSelection;
  window.toggleSelectAllExpenses = toggleSelectAllExpenses;
  window.clearExpenseSelection = clearExpenseSelection;
  window.editSelectedExpense = editSelectedExpense;
  window.deleteSelectedExpenses = deleteSelectedExpenses;
  window.editExpense = editExpense;
  window.deleteExpense = deleteExpense;
  window.closeEditExpenseModal = closeEditExpenseModal;
  window.onEditExpenseBudgetChange = () => updateCategorySelect(document.getElementById('editExpCategory'), document.getElementById('editExpBudget')?.value);
  window.onEditExpenseBucketChange = () => {
    const bucket = getBucketById(document.getElementById('editExpBucket')?.value);
    if (bucket?.currency) {
      document.getElementById('editExpCurrency').value = bucket.currency;
      window.onEditExpenseCurrencyChange();
    }
  };
  window.onEditExpenseCurrencyChange = () => {
    updateRateSelect(
      document.getElementById('editExpRateSelect'),
      document.getElementById('editExpRateManual'),
      document.getElementById('editExpCurrency')?.value,
      document.getElementById('editExpUSD'),
      document.getElementById('editExpLocalAmount')
    );
  };
  window.onEditExpenseMathChange = () => {
    recalcExpenseUsd(
      document.getElementById('editExpUSD'),
      document.getElementById('editExpLocalAmount'),
      document.getElementById('editExpCurrency')?.value,
      document.getElementById('editExpRateSelect'),
      document.getElementById('editExpRateManual')
    );
  };

  selectedExpenseIds.clear();
  refreshExpenseList();
}

function expenseMatchesCategoryFilter(exp, filterKey) {
  if (!filterKey) return true;
  if (filterKey.startsWith('id:')) {
    return exp.category_id === filterKey.slice(3);
  }
  if (filterKey.startsWith('label:')) {
    return getExpenseCategoryLabel(exp, teamCategoriesCache) === filterKey.slice(6);
  }
  return true;
}

function populateExpenseCategoryFilter(budgetId = '') {
  const select = document.getElementById('expFilterCategory');
  if (!select) return;
  const current = select.value;
  select.innerHTML = '<option value="">All</option>';

  const seen = new Set();
  const addOption = (value, label) => {
    if (!value || !label || seen.has(value)) return;
    seen.add(value);
    const safeLabel = label.replace(/</g, '&lt;');
    select.innerHTML += `<option value="${value.replace(/"/g, '&quot;')}">${safeLabel}</option>`;
  };

  const budgets = budgetId
    ? teamBudgetsCache.filter(b => b.id === budgetId)
    : teamBudgetsCache;

  budgets.forEach(budget => {
    getBudgetCategoryOptions(budget, teamCategoriesCache).forEach(opt => {
      const key = opt.categoryId ? `id:${opt.categoryId}` : `label:${opt.label}`;
      addOption(key, opt.label);
    });
  });

  teamExpensesCache.forEach(exp => {
    if (budgetId && exp.budget_id !== budgetId) return;
    const label = getExpenseCategoryLabel(exp, teamCategoriesCache);
    if (exp.category_id) {
      addOption(`id:${exp.category_id}`, label);
    } else if (label && label !== '—') {
      addOption(`label:${label}`, label);
    }
  });

  if (current && seen.has(current)) select.value = current;
}

function getFilteredExpenses() {
  const budgetId = document.getElementById('expFilterBudget')?.value;
  const categoryKey = document.getElementById('expFilterCategory')?.value;
  const bucketId = document.getElementById('expFilterBucket')?.value;
  const start = document.getElementById('expFilterStart')?.value;
  const end = document.getElementById('expFilterEnd')?.value;

  return teamExpensesCache.filter(e => {
    if (budgetId && e.budget_id !== budgetId) return false;
    if (!expenseMatchesCategoryFilter(e, categoryKey)) return false;
    if (bucketId && e.bucket_id !== bucketId) return false;
    if (start && e.date < start) return false;
    if (end && e.date > end) return false;
    return true;
  }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

function refreshExpenseList() {
  const filtered = getFilteredExpenses();
  const tbody = document.getElementById('expenseTableBody');
  const mobile = document.getElementById('expenseMobileList');
  const empty = document.getElementById('expenseEmpty');
  const countEl = document.getElementById('expenseCount');

  countEl.textContent = filtered.length ? `(${filtered.length})` : '';

  if (!filtered.length) {
    if (tbody) tbody.innerHTML = '';
    if (mobile) mobile.innerHTML = '';
    empty.style.display = 'block';
    updateExpenseSelectionUi();
    return;
  }
  empty.style.display = 'none';

  let tableHtml = '';
  let mobileHtml = '';

  filtered.forEach(exp => {
    const budget = getBudgetById(exp.budget_id);
    const bucket = getBucketById(exp.bucket_id);
    const catLabel = getExpenseCategoryLabel(exp, teamCategoriesCache);
    const canEdit = canEditExpense(exp);
    const receipt = exp.receipt_url ? `<a href="${exp.receipt_url}" target="_blank" rel="noopener">📎</a>` : '—';
    const selected = selectedExpenseIds.has(exp.id);

    tableHtml += `
      <tr class="${selected ? 'selected' : ''}">
        <td class="checkbox-col">${canEdit ? `<input type="checkbox" ${selected ? 'checked' : ''} onchange="window.toggleExpenseSelection('${exp.id}', this)">` : ''}</td>
        <td>${exp.date}</td>
        <td>${exp.item}</td>
        <td>${budget?.name || '—'}</td>
        <td>${catLabel}</td>
        <td>${bucket?.name || '—'}</td>
        <td>${(exp.local_amount || 0).toLocaleString()} ${exp.currency || ''}</td>
        <td>$${(exp.usd_amount || 0).toFixed(2)}</td>
        <td>${receipt}</td>
        <td class="action-buttons">
          ${canEdit ? `<button type="button" class="info small" onclick="window.editExpense('${exp.id}')">Edit</button>
          <button type="button" class="danger small" onclick="window.deleteExpense('${exp.id}')">Del</button>` : '<span style="color:#999;font-size:0.8em;">View only</span>'}
        </td>
      </tr>`;

    mobileHtml += `
      <article class="data-card data-card--compact">
        <div class="data-card-top">
          <span class="data-card-title">${exp.item}</span>
          <span class="data-card-badges">$${(exp.usd_amount || 0).toFixed(2)}</span>
        </div>
        <div class="data-card-summary">${exp.date} · ${budget?.name || '—'} · ${catLabel}</div>
        ${canEdit ? `<div class="data-card-actions">
          <button type="button" class="info small" onclick="window.editExpense('${exp.id}')">Edit</button>
          <button type="button" class="danger small" onclick="window.deleteExpense('${exp.id}')">Del</button>
        </div>` : ''}
      </article>`;
  });

  if (tbody) tbody.innerHTML = tableHtml;
  if (mobile) mobile.innerHTML = mobileHtml;
  updateExpenseSelectionUi();
}

function toggleExpenseSelection(id, checkbox) {
  if (checkbox.checked) selectedExpenseIds.add(id);
  else selectedExpenseIds.delete(id);
  updateExpenseSelectionUi();
  refreshExpenseList();
}

function toggleSelectAllExpenses(master) {
  const filtered = getFilteredExpenses().filter(canEditExpense);
  filtered.forEach(exp => {
    if (master.checked) selectedExpenseIds.add(exp.id);
    else selectedExpenseIds.delete(exp.id);
  });
  refreshExpenseList();
}

function clearExpenseSelection() {
  selectedExpenseIds.clear();
  refreshExpenseList();
}

function updateExpenseSelectionUi() {
  const count = selectedExpenseIds.size;
  const actions = document.getElementById('expBulkActions');
  const countEl = document.getElementById('expSelectedCount');
  const editBtn = document.getElementById('expEditSelectedBtn');
  if (countEl) countEl.textContent = `${count} selected`;
  if (actions) actions.classList.toggle('active', count > 0);
  if (editBtn) editBtn.disabled = count !== 1;
}

function resetExpenseFilters() {
  document.getElementById('expFilterBudget').value = '';
  document.getElementById('expFilterCategory').value = '';
  document.getElementById('expFilterBucket').value = '';
  document.getElementById('expFilterStart').value = '';
  document.getElementById('expFilterEnd').value = '';
  populateExpenseCategoryFilter();
  refreshExpenseList();
}

function editExpense(id) {
  const exp = teamExpensesCache.find(e => e.id === id);
  if (!exp || !canEditExpense(exp)) {
    showToast('You cannot edit this expense', 'error');
    return;
  }

  document.getElementById('editExpId').value = exp.id;
  document.getElementById('editExpDate').value = exp.date;
  document.getElementById('editExpItem').value = exp.item;
  document.getElementById('editExpLocalAmount').value = exp.local_amount;
  document.getElementById('editExpDescription').value = exp.description || '';
  document.getElementById('editExpReceiptUrl').value = exp.receipt_url || '';

  populateBudgetSelect(document.getElementById('editExpBudget'), false);
  document.getElementById('editExpBudget').value = exp.budget_id;
  window.onEditExpenseBudgetChange();

  const catLabel = getExpenseCategoryLabel(exp, teamCategoriesCache);
  const catSelect = document.getElementById('editExpCategory');
  for (const opt of catSelect.options) {
    if (opt.dataset.label === catLabel) { catSelect.value = opt.value; break; }
  }

  populateBucketSelect(document.getElementById('editExpBucket'));
  document.getElementById('editExpBucket').value = exp.bucket_id;

  populateCurrencySelect(document.getElementById('editExpCurrency'));
  document.getElementById('editExpCurrency').value = exp.currency;
  window.onEditExpenseCurrencyChange();

  const rateStr = rateForInput(exp.rate);
  const rateSelect = document.getElementById('editExpRateSelect');
  const hasOpt = [...rateSelect.options].some(o => o.value === rateStr);
  if (hasOpt) {
    rateSelect.value = rateStr;
    document.getElementById('editExpRateManual').value = '';
  } else {
    rateSelect.value = '';
    document.getElementById('editExpRateManual').value = rateStr;
  }
  document.getElementById('editExpUSD').value = (exp.usd_amount || 0).toFixed(2);
  document.getElementById('editExpenseModal').classList.add('active');
}

function closeEditExpenseModal() {
  document.getElementById('editExpenseModal')?.classList.remove('active');
}

async function handleEditExpenseSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('editExpId').value;
  const existing = teamExpensesCache.find(x => x.id === id);
  if (!existing || !canEditExpense(existing)) return;

  const form = document.getElementById('editExpenseForm');
  form._rates = exchangeRatesCache;

  const payload = buildExpensePayload(form, state.currentTeam.team_id, existing.created_by);
  payload.updated_at = new Date().toISOString();

  validateAndWarnExpense(payload, id, async () => {
    try {
      await saveExpenseRecord(payload, true, id);
      showToast('Expense updated', 'success');
      closeEditExpenseModal();
      refreshExpenseList();
    } catch (err) {
      showToast(err.message || 'Update failed', 'error');
    }
  });
}

function editSelectedExpense() {
  if (selectedExpenseIds.size !== 1) return;
  editExpense([...selectedExpenseIds][0]);
}

function deleteExpense(id) {
  const exp = teamExpensesCache.find(e => e.id === id);
  if (!exp || !canEditExpense(exp)) return;

  showConfirm(`Delete expense <strong>${exp.item}</strong> ($${(exp.usd_amount || 0).toFixed(2)})?`, async () => {
    try {
      await sbSoftDelete('expenses', id);
      teamExpensesCache = teamExpensesCache.filter(e => e.id !== id);
      selectedExpenseIds.delete(id);
      showToast('Expense deleted', 'success');
      refreshExpenseList();
    } catch (err) {
      showToast(err.message || 'Delete failed', 'error');
    }
  });
}

function deleteSelectedExpenses() {
  if (selectedExpenseIds.size === 0) return;
  const ids = [...selectedExpenseIds].filter(id => {
    const exp = teamExpensesCache.find(e => e.id === id);
    return exp && canEditExpense(exp);
  });
  if (!ids.length) return;

  showConfirm(`Delete ${ids.length} expense(s)?`, async () => {
    for (const id of ids) {
      await sbSoftDelete('expenses', id);
      selectedExpenseIds.delete(id);
    }
    await loadTeamExpenses();
    showToast(`${ids.length} expense(s) deleted`, 'success');
    refreshExpenseList();
  });
}
