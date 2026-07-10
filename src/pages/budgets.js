/* ========== BUDGET PLANS CRUD ========== */
import { state } from '../state.js';
import { supabaseClient, localGetAll, localPut, sbInsert, sbUpdate, sbSoftDelete, sbSelect } from '../db.js';
import { showToast, showConfirm } from '../components/toasts.js';
import { getLatestUsdRate, getLocalCurrenciesFromRates, usdToLocal, rateForInput } from '../utils/currency.js';
import { loadCategoryMasterLines, normalizeBudgetCategory, formatCategoryLabel } from '../utils/categoryMaster.js';
import { formatDisplayDate } from '../utils/budgetCalendar.js';
import { btnIconEdit, btnIconDelete, cardRow } from '../utils/uiHelpers.js';

let calendarEntriesCache = [];
let editTemplateRowKeys = null;

async function ensureEditTemplateRowKeys() {
  if (editTemplateRowKeys) return editTemplateRowKeys;
  const lines = await loadCategoryMasterLines();
  editTemplateRowKeys = new Set(lines.map(l => `${l.category}|${l.subcategory || ''}`));
  return editTemplateRowKeys;
}

function isTemplateBudgetRow(category, subcategory) {
  if (!editTemplateRowKeys) return false;
  return editTemplateRowKeys.has(`${category}|${subcategory || ''}`);
}

function escapeHtmlAttr(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function getEditRowCategoryName(row) {
  const hidden = row.querySelector('.edit-budget-cat-name-value');
  if (hidden?.value) return hidden.value.trim();
  const input = row.querySelector('.edit-budget-cat-name-input');
  if (input?.value) return input.value.trim();
  const sel = row.querySelector('.edit-budget-cat-name');
  if (sel) return (sel.value || sel.getAttribute('data-selected') || '').trim();
  return '';
}

function formatLocalInput(value) {
  const n = parseFloat(value);
  if (Number.isNaN(n)) return '';
  return n.toFixed(2);
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

function normalizeBudgetPlan(budget) {
  return budget ? { ...budget, categories: parseBudgetCategories(budget.categories) } : budget;
}

async function ensureExchangeRatesLoaded() {
  if (!state.currentTeam?.team_id) return;
  const result = await sbSelect('exchange_rates', {
    teamId: state.currentTeam.team_id,
    orderBy: 'date',
    ascending: false
  });
  state.exchangeRates = (result.data || []).filter(r => !r.is_deleted);
}

// ========== CREATE BUDGET ==========
export function getCreateBudgetPage() {
  if (!state.canCreateBudgets) {
    return `
      <h1 class="page-title">Create Budget</h1>
      <div class="card">
        <h2>⛔ Access Denied</h2>
        <p>You do not have permission to create budgets.</p>
      </div>
    `;
  }

  return `
    <h1 class="page-title">Create Budget</h1>
    <div class="card">
      <h2>➕ New Budget Plan</h2>
      <form id="createBudgetForm" onsubmit="window.createBudget(event)">
        <div class="form-stack">
          <div class="form-grid-row form-grid-row--budget-a">
            <div class="form-group" id="monthlyCalendarGroup">
              <label>Budget Period Date</label>
              <select id="newBudgetCalendarEntry" required><option value="">Select date…</option></select>
            </div>
            <div class="form-group" id="adhocDateGroup" style="display:none;">
              <label>Budget Period Date</label>
              <input type="date" id="newBudgetAdhocDate">
            </div>
            <div class="form-group">
              <label>Budget Name</label>
              <input type="text" id="newBudgetName" placeholder="March 2026, Dubai Trip" required onblur="window.validateBudgetName(this)">
            </div>
          </div>
          <div class="form-grid-row form-grid-row--budget-b">
            <div class="form-group">
              <label>Budget Type</label>
              <select id="newBudgetType" required onchange="window.onBudgetTypeChange()"><option value="monthly" selected>Monthly</option><option value="adhoc">Adhoc</option></select>
            </div>
            <div class="form-group">
              <label>Status</label>
              <select id="newBudgetStatus" required><option value="draft" selected>Draft</option><option value="current">Current</option><option value="archive">Archive</option></select>
            </div>
            <div class="form-group">
              <label>Currency</label>
              <select id="newBudgetCurrency" required onchange="window.onCreateBudgetCurrencyChange()"><option value="">—</option></select>
            </div>
            <div class="form-group">
              <label>Exch Rate</label>
              <input type="number" class="input-rate" id="newBudgetRate" step="any" placeholder="Rate" required oninput="window.onCreateBudgetRateChange()">
            </div>
          </div>
          <p class="form-hint">1 USD = X local currency</p>
        </div>

        <h3 style="margin-top: 25px;">Categories & Amounts</h3>
        <p style="margin-bottom: 15px; color: #666;">Enter USD amounts (primary). Select currency to auto-fill rate. Local amount auto-calculates.</p>

        <div id="budgetCategoriesContainer" class="budget-line-cards"></div>
        <div class="budget-grand-total-card">
          ${cardRow('Total USD', '<span id="createBudgetTotalUsd">0.00</span>')}
          ${cardRow('Total Local', '<span id="createBudgetTotalLocal">0.00</span>')}
        </div>

        <div class="btn-group">
          <button type="button" class="secondary" onclick="window.addCategoryRow()">+ Add Category</button>
          <button type="submit">Create Budget</button>
        </div>
      </form>
    </div>
  `;
}

export async function initCreateBudgetPage() {
  if (!state.canCreateBudgets) return;

  await ensureExchangeRatesLoaded();
  await loadCalendarEntriesCache();
  populateCalendarSelect();
  populateCreateBudgetCurrencySelect();
  await seedCreateBudgetCategoryRows();

  window.onBudgetTypeChange = onBudgetTypeChange;
  window.onCreateBudgetCurrencyChange = onCreateBudgetCurrencyChange;
  window.onCreateBudgetRateChange = onCreateBudgetRateChange;
  window.onCreateBudgetUSDChange = onCreateBudgetUSDChange;

  onBudgetTypeChange();
}

async function loadCalendarEntriesCache() {
  try {
    const { data, error } = await supabaseClient
      .from('budget_calendar_entries')
      .select('*')
      .eq('is_deleted', false)
      .order('budget_period_date');

    calendarEntriesCache = error ? [] : (data || []);
  } catch (err) {
    console.warn('Failed to load budget calendar entries:', err);
    calendarEntriesCache = [];
  }
}

function populateCalendarSelect() {
  const select = document.getElementById('newBudgetCalendarEntry');
  if (!select) return;

  const current = select.value;
  select.innerHTML = '<option value="">Select date…</option>';
  calendarEntriesCache.forEach(entry => {
    const label = entry.label
      ? `${formatDisplayDate(entry.budget_period_date)} — ${entry.label}`
      : formatDisplayDate(entry.budget_period_date);
    select.innerHTML += `<option value="${entry.id}">${label}</option>`;
  });
  if (current) select.value = current;
}

function onBudgetTypeChange() {
  const type = document.getElementById('newBudgetType')?.value || 'monthly';
  const monthlyGroup = document.getElementById('monthlyCalendarGroup');
  const adhocGroup = document.getElementById('adhocDateGroup');
  const calSelect = document.getElementById('newBudgetCalendarEntry');
  const adhocInput = document.getElementById('newBudgetAdhocDate');

  if (type === 'monthly') {
    if (monthlyGroup) monthlyGroup.style.display = '';
    if (adhocGroup) adhocGroup.style.display = 'none';
    if (calSelect) calSelect.required = true;
    if (adhocInput) {
      adhocInput.required = false;
      adhocInput.value = '';
    }
  } else {
    if (monthlyGroup) monthlyGroup.style.display = 'none';
    if (adhocGroup) adhocGroup.style.display = '';
    if (calSelect) {
      calSelect.required = false;
      calSelect.value = '';
    }
    if (adhocInput) adhocInput.required = true;
  }
}

function populateCreateBudgetCurrencySelect() {
  const select = document.getElementById('newBudgetCurrency');
  if (!select) return;

  const currencies = getLocalCurrenciesFromRates(state.exchangeRates || []);
  select.innerHTML = '<option value="">—</option>';
  currencies.forEach(c => {
    select.innerHTML += `<option value="${c}">${c}</option>`;
  });
  select.innerHTML += '<option value="USD">USD</option>';
}

function onCreateBudgetCurrencyChange() {
  const currency = document.getElementById('newBudgetCurrency')?.value;
  const rateInput = document.getElementById('newBudgetRate');
  if (!currency || !rateInput) return;

  if (currency === 'USD') {
    rateInput.value = '1';
  } else {
    const rate = getLatestUsdRate(state.exchangeRates || [], currency);
    rateInput.value = rate !== null ? rateForInput(rate) : '';
  }
  updateCreateBudgetTotals();
}

function onCreateBudgetRateChange() {
  updateCreateBudgetTotals();
}

function onCreateBudgetUSDChange() {
  updateCreateBudgetTotals();
}

function updateCreateBudgetTotals() {
  const rows = document.querySelectorAll('#budgetCategoriesContainer .category-row');
  let totalUsd = 0;
  let totalLocal = 0;
  const { currency, rate } = getCreateBudgetHeaderCurrency();

  rows.forEach(row => {
    const usd = parseFloat(row.querySelector('.budget-cat-usd')?.value) || 0;
    const local = parseFloat(row.querySelector('.budget-cat-local')?.value) || 0;
    totalUsd += usd;
    totalLocal += local;
  });

  const usdEl = document.getElementById('createBudgetTotalUsd');
  const localEl = document.getElementById('createBudgetTotalLocal');
  if (usdEl) usdEl.textContent = totalUsd.toFixed(2);
  if (localEl) {
    localEl.textContent = totalLocal > 0
      ? totalLocal.toFixed(2)
      : (rate > 0 ? usdToLocal(totalUsd, rate).toFixed(2) : '0.00');
  }
}

function getCreateBudgetHeaderCurrency() {
  const currency = document.getElementById('newBudgetCurrency')?.value || 'USD';
  const rate = parseFloat(document.getElementById('newBudgetRate')?.value)
    || (currency === 'USD' ? 1 : 0);
  return { currency, rate };
}

function buildCreateCategoryRow(line) {
  const displayName = formatCategoryLabel(line.category, line.subcategory);
  const row = document.createElement('div');
  row.className = 'budget-line-card category-row';
  row.dataset.template = 'true';
  row.innerHTML = `
    <input type="hidden" class="budget-cat-category" value="${escapeHtmlAttr(line.category)}">
    <input type="hidden" class="budget-cat-subcategory" value="${escapeHtmlAttr(line.subcategory || '')}">
    <div class="budget-line-card-title">${escapeHtmlAttr(displayName)}</div>
    <div class="field-labeled"><span>USD Amount</span>
      <input type="number" class="budget-cat-usd" step="0.01" placeholder="USD" required oninput="window.onBudgetUSDChange(this)">
    </div>
    <div class="field-labeled"><span>Currency</span>
      <select class="budget-cat-currency" required onchange="window.onBudgetCurrencyChange(this)"><option value="">Currency</option></select>
    </div>
    <div class="field-labeled"><span>Exchange Rate</span>
      <input type="number" class="budget-cat-rate" step="0.000001" placeholder="Rate" oninput="window.onBudgetRateChange(this)">
    </div>
    <div class="field-labeled"><span>Local Amount</span>
      <input type="number" class="budget-cat-local" step="0.01" placeholder="Local" readonly>
    </div>
  `;
  return row;
}

async function seedCreateBudgetCategoryRows() {
  const container = document.getElementById('budgetCategoriesContainer');
  if (!container) return;

  container.innerHTML = '';
  const lines = await loadCategoryMasterLines();
  lines.forEach(line => container.appendChild(buildCreateCategoryRow(line)));
  populateCategoryRows();
  updateCreateBudgetTotals();
}

async function populateCategoryRows() {
  const container = document.getElementById('budgetCategoriesContainer');
  if (!container) return;
  const rows = container.querySelectorAll('.category-row');

  rows.forEach(row => {
    const currSelect = row.querySelector('.budget-cat-currency');
    const currentCurr = currSelect ? currSelect.value : '';

    if (currSelect) {
      currSelect.innerHTML = '<option value="">Currency</option>';
      const uniqueCurrencies = getLocalCurrenciesFromRates(state.exchangeRates || []);
      uniqueCurrencies.forEach(c => {
        currSelect.innerHTML += `<option value="${c}">${c}</option>`;
      });
      currSelect.innerHTML += '<option value="USD">USD</option>';
      if (currentCurr) currSelect.value = currentCurr;
    }
  });
}

window.addCategoryRow = function() {
  const container = document.getElementById('budgetCategoriesContainer');
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'budget-line-card category-row';
  row.dataset.custom = 'true';
  row.innerHTML = `
    <div class="line-card-header">
      <span class="line-card-header-label">Custom category</span>
      ${btnIconDelete('window.removeCategoryRow(this)', 'Remove')}
    </div>
    <div class="field-labeled"><span>Category</span>
      <input type="text" class="budget-cat-name" required placeholder="Category name">
    </div>
    <div class="field-labeled"><span>USD Amount</span>
      <input type="number" class="budget-cat-usd" step="0.01" placeholder="USD" required oninput="window.onBudgetUSDChange(this)">
    </div>
    <div class="field-labeled"><span>Currency</span>
      <select class="budget-cat-currency" required onchange="window.onBudgetCurrencyChange(this)"><option value="">Currency</option></select>
    </div>
    <div class="field-labeled"><span>Exchange Rate</span>
      <input type="number" class="budget-cat-rate" step="0.000001" placeholder="Rate" oninput="window.onBudgetRateChange(this)">
    </div>
    <div class="field-labeled"><span>Local Amount</span>
      <input type="number" class="budget-cat-local" step="0.01" placeholder="Local" readonly>
    </div>
  `;
  container.appendChild(row);
  populateCategoryRows();
  updateCreateBudgetTotals();
};

window.removeCategoryRow = function(btn) {
  const row = btn.closest('.category-row');
  if (!row) return;
  if (row.dataset.template === 'true') {
    showToast('Template categories cannot be removed', 'warning');
    return;
  }
  row.remove();
  updateCreateBudgetTotals();
};

window.onBudgetUSDChange = function(usdInput) {
  const row = usdInput.closest('.category-row');
  if (!row) return;
  recalculateBudgetLocal(row);
};

window.onBudgetCurrencyChange = function(currencySelect) {
  const row = currencySelect.closest('.category-row');
  if (!row) return;
  const currency = currencySelect.value;
  const rateInput = row.querySelector('.budget-cat-rate');
  if (!currency || !rateInput) return;

  if (currency === 'USD') {
    rateInput.value = '1';
    recalculateBudgetLocal(row);
    return;
  }

  const rates = state.exchangeRates || [];
  const currencyRates = rates
    .filter(r => r.currency === currency && !r.is_deleted)
    .sort((a, b) => new Date(b.date || b.created_at) - new Date(a.date || a.created_at));

  if (currencyRates.length > 0) {
    rateInput.value = currencyRates[0].rate;
  } else {
    rateInput.value = '';
  }
  recalculateBudgetLocal(row);
};

window.onBudgetRateChange = function(rateInput) {
  const row = rateInput.closest('.category-row');
  if (!row) return;
  recalculateBudgetLocal(row);
};

function recalculateBudgetLocal(row) {
  const usdInput = row.querySelector('.budget-cat-usd');
  const rateInput = row.querySelector('.budget-cat-rate');
  const localInput = row.querySelector('.budget-cat-local');
  if (!usdInput || !rateInput || !localInput) return;

  const usdAmount = parseFloat(usdInput.value) || 0;
  const rate = parseFloat(rateInput.value) || 0;

  if (usdAmount > 0 && rate > 0) {
    localInput.value = (usdAmount / rate).toFixed(2);
  } else {
    localInput.value = '';
  }
  updateCreateBudgetTotals();
}

window.validateBudgetName = function(input) {
  const name = input.value.trim();
  if (!name) return;

  const existing = state.budgetPlans || [];
  const teamId = state.currentTeam?.team_id;
  const duplicate = existing.find(b => b.name.toLowerCase().trim() === name.toLowerCase() && b.team_id === teamId && !b.is_deleted);

  if (duplicate) {
    input.style.borderColor = '#dc3545';
    showToast('A budget with this name already exists in your team', 'warning');
  } else {
    input.style.borderColor = '';
  }
};

window.createBudget = async function(e) {
  e.preventDefault();
  if (!state.canCreateBudgets) {
    showToast('You do not have permission to create budgets', 'error');
    return;
  }

  const name = document.getElementById('newBudgetName').value.trim();
  const status = document.getElementById('newBudgetStatus').value;
  const budgetType = document.getElementById('newBudgetType')?.value || 'monthly';

  if (!name) {
    showToast('Please enter a budget name', 'error');
    return;
  }

  let calendar_entry_id = null;
  let budget_period_date = null;

  if (budgetType === 'monthly') {
    const entryId = document.getElementById('newBudgetCalendarEntry')?.value;
    if (!entryId) {
      showToast('Select a budget period date from the calendar', 'error');
      return;
    }
    const entry = calendarEntriesCache.find(e => e.id === entryId);
    calendar_entry_id = entryId;
    budget_period_date = entry?.budget_period_date || null;
  } else {
    budget_period_date = document.getElementById('newBudgetAdhocDate')?.value || null;
    if (!budget_period_date) {
      showToast('Select a budget period date for this adhoc budget', 'error');
      return;
    }
  }

  const existing = state.budgetPlans || [];
  const teamId = state.currentTeam?.team_id;
  const duplicate = existing.find(b => b.name.toLowerCase().trim() === name.toLowerCase() && b.team_id === teamId && !b.is_deleted);
  if (duplicate) {
    showToast('A budget with this name already exists in your team', 'error');
    return;
  }

  const categories = [];
  const rows = document.querySelectorAll('.category-row');

  rows.forEach(row => {
    const catCategory = row.querySelector('.budget-cat-category')?.value?.trim()
      || row.querySelector('.budget-cat-name')?.value?.trim();
    const catSub = row.querySelector('.budget-cat-subcategory')?.value?.trim() || null;
    const usdAmount = parseFloat(row.querySelector('.budget-cat-usd').value);
    const localAmount = parseFloat(row.querySelector('.budget-cat-local').value) || 0;
    const currency = row.querySelector('.budget-cat-currency').value;
    const rate = parseFloat(row.querySelector('.budget-cat-rate').value) || 0;

    if (catCategory && usdAmount && currency) {
      categories.push({
        category: catCategory,
        subcategory: catSub,
        name: formatCategoryLabel(catCategory, catSub),
        usdAmount: usdAmount,
        localAmount: localAmount || (currency === 'USD' ? usdAmount : usdAmount / (rate || 1)),
        currency: currency,
        rate: rate || (currency === 'USD' ? 1 : 0)
      });
    }
  });

  if (categories.length === 0) {
    showToast('Please add at least one category with USD amount', 'error');
    return;
  }

  const totalAmount = categories.reduce((sum, c) => sum + c.usdAmount, 0);

  const budget = {
    team_id: teamId,
    name: name,
    status: status,
    budget_type: budgetType,
    calendar_entry_id,
    budget_period_date,
    categories: categories,
    total_amount: totalAmount,
    spent_amount: 0,
    created_by: state.user?.id,
    is_deleted: false
  };

  const btn = e.target.querySelector('button[type="submit"]');
  const originalText = btn.textContent;
  btn.textContent = 'Creating...';
  btn.disabled = true;

  try {
    const result = await sbInsert('budget_plans', budget);
    if (result && !result.error) {
      showToast(`Budget "${name}" created successfully!`, 'success');
      document.getElementById('createBudgetForm').reset();
      await seedCreateBudgetCategoryRows();
      populateCreateBudgetCurrencySelect();
      populateCalendarSelect();
      onBudgetTypeChange();
      const all = await localGetAll('budget_plans');
      state.budgetPlans = all.filter(b => b.team_id === teamId);
      window.showPage('view-budgets');
    } else {
      showToast(result?.error?.message || 'Failed to create budget', 'error');
    }
  } catch (err) {
    console.error('Create budget error:', err);
    showToast('Failed to create budget', 'error');
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
};

// ========== VIEW BUDGETS ==========
export function getViewBudgetsPage() {
  return `
    <h1 class="page-title">View Budgets</h1>

    <div class="card">
      <h2>🔍 Filter Budgets</h2>
      <div class="form-stack">
        <div class="form-grid-row form-grid-row--filter-simple">
          <div class="form-group">
            <label>Status</label>
            <select id="budgetFilterStatus" onchange="window.initViewBudgetsPage()">
              <option value="current" selected>Current</option>
              <option value="all">All</option>
              <option value="draft">Draft</option>
              <option value="archive">Archive</option>
            </select>
          </div>
          <div class="form-group">
            <label>Budget Name</label>
            <select id="budgetFilterName" onchange="window.initViewBudgetsPage()"><option value="">All Budgets</option></select>
          </div>
        </div>
      </div>
    </div>

    <div id="budgetsContainer"></div>

    <div id="editBudgetModal" class="modal">
      <div class="modal-content" style="max-width: 900px;">
        <button class="close-modal" onclick="window.closeEditBudgetModal()">&times;</button>
        <h2>Edit Budget</h2>
        <form id="editBudgetForm" onsubmit="window.saveEditedBudget(); return false;">
          <input type="hidden" id="editBudgetId">
          <div class="form-grid-row form-grid-row--meta edit-budget-meta">
            <div class="form-group">
              <label>Budget Name</label>
              <input type="text" id="editBudgetName" required onblur="window.validateEditBudgetName(this)">
            </div>
            <div class="form-group">
              <label>Status</label>
              <select id="editBudgetStatus" required>
                <option value="draft">Draft</option>
                <option value="current">Current</option>
                <option value="archive">Archive</option>
              </select>
            </div>
          </div>
          <h3 style="margin-top: 25px;">Categories & Amounts</h3>
          <p id="editBudgetRateNote" style="margin-bottom: 15px; color: #666;">USD amounts are primary. Select currency to auto-fill rate (1 USD = X local). Local amount = USD × rate.</p>
          <div id="editBudgetCategoriesContainer" class="budget-line-cards"></div>
          <div class="btn-group">
            <button type="button" class="secondary" id="addEditCatBtn" onclick="window.addEditCategoryRow()">+ Add Category</button>
            <button type="submit" class="success" id="saveEditBudgetBtn">Save Changes</button>
            <button type="button" class="secondary" onclick="window.closeEditBudgetModal()">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

export async function initViewBudgetsPage() {
  const container = document.getElementById('budgetsContainer');
  if (!container) {
    setTimeout(() => window.initViewBudgetsPage(), 50);
    return;
  }

  const statusFilterEl = document.getElementById('budgetFilterStatus');
  const nameFilterEl = document.getElementById('budgetFilterName');
  const statusFilter = statusFilterEl ? statusFilterEl.value : 'current';
  const nameFilter = nameFilterEl ? nameFilterEl.value : '';

  const teamId = state.currentTeam?.team_id;

  if (!state.budgetPlans || state.budgetPlans.length === 0) {
    try {
      const localBudgets = await localGetAll('budget_plans');
      state.budgetPlans = localBudgets.filter(b => b.team_id === teamId && !b.is_deleted).map(normalizeBudgetPlan);
    } catch (e) {
      console.warn('Failed to load budgets from local DB:', e);
    }
  }

  const allBudgets = state.budgetPlans || [];
  let budgets = allBudgets.filter(b => b.team_id === teamId && !b.is_deleted);

  const nameSelect = document.getElementById('budgetFilterName');
  if (nameSelect) {
    const currentVal = nameSelect.value;
    nameSelect.innerHTML = '<option value="">All Budgets</option>';
    allBudgets.filter(b => b.team_id === teamId && !b.is_deleted).forEach(b => {
      nameSelect.innerHTML += `<option value="${b.id}">${b.name}</option>`;
    });
    nameSelect.value = currentVal;
  }

  if (statusFilter !== 'all') {
    budgets = budgets.filter(b => (b.status || 'current') === statusFilter);
  }
  if (nameFilter) {
    budgets = budgets.filter(b => b.id === nameFilter);
  }

  if (allBudgets.filter(b => b.team_id === teamId && !b.is_deleted).length === 0) {
    container.innerHTML = `
      <div class="card empty-state">
        <h2>No Budgets Created Yet</h2>
        <p>Create your first budget plan to start tracking expenses.</p>
        <button onclick="window.showPage('create-budget')" style="margin-top: 15px;">Create Budget</button>
      </div>
    `;
    return;
  }

  if (budgets.length === 0) {
    container.innerHTML = `
      <div class="card empty-state">
        <h2>No budgets match your filter</h2>
        <p>Try changing the status filter or create a new budget.</p>
      </div>
    `;
    return;
  }

  if ((statusFilter === 'all' || budgets.length > 1) && !nameFilter) {
    renderBudgetSummaryTable(container, budgets);
    return;
  }

  renderBudgetDetailCards(container, budgets);
}

// Map the initialization explicitly to window for full routing access
window.initViewBudgetsPage = initViewBudgetsPage;

function renderBudgetSummaryTable(container, budgets) {
  let tableRows = '';
  let mobileCards = '';

  let grandTotalBudgeted = 0;
  let grandTotalSpent = 0;

  budgets.forEach(budget => {
    let totalBudgetedUSD = 0;
    let totalSpentUSD = 0;

    (budget.categories || []).forEach(cat => {
      totalBudgetedUSD += cat.usdAmount || cat.usd_amount || 0;
    });

    totalSpentUSD = budget.spent_amount || 0;

    const remaining = totalBudgetedUSD - totalSpentUSD;
    const isOver = remaining < 0;
    const budgetStatus = budget.status || 'current';

    let statusBadge = '';
    if (budgetStatus === 'draft') statusBadge = '<span class="badge badge-secondary">Draft</span>';
    else if (budgetStatus === 'archive') statusBadge = '<span class="badge badge-info">Archive</span>';
    else statusBadge = '<span class="badge badge-success">Current</span>';

    let healthBadge = '';
    if (isOver) healthBadge = '<span class="badge badge-danger">Over Budget</span>';
    else if (totalBudgetedUSD > 0 && totalSpentUSD / totalBudgetedUSD > 0.9) healthBadge = '<span class="badge badge-warning">Near Limit</span>';
    else healthBadge = '<span class="badge badge-success">On Track</span>';

    grandTotalBudgeted += totalBudgetedUSD;
    grandTotalSpent += totalSpentUSD;

    const canEdit = state.canEditBudgets;
    const canDelete = state.canDeleteBudgets;

    tableRows += `
      <tr style="cursor: pointer;" onclick="window.viewBudgetDetail('${budget.id}')">
        <td data-label="Budget"><strong>${budget.name}</strong></td>
        <td data-label="Status">${statusBadge}</td>
        <td data-label="Budgeted">$${totalBudgetedUSD.toFixed(2)}</td>
        <td data-label="Spent">$${totalSpentUSD.toFixed(2)}</td>
        <td data-label="Remaining" class="${isOver ? 'negative' : 'positive'}" style="font-weight: bold;">$${remaining.toFixed(2)}</td>
        <td data-label="Health">${healthBadge}</td>
        <td data-label="Actions" class="action-buttons">
          ${canEdit ? btnIconEdit(`event.stopPropagation(); window.editBudgetPlan('${budget.id}')`) : ''}
          ${canDelete ? btnIconDelete(`event.stopPropagation(); window.deleteBudgetPlan('${budget.id}')`) : ''}
        </td>
      </tr>
    `;

    mobileCards += `
      <article class="data-card data-card--compact data-card--clickable" onclick="window.viewBudgetDetail('${budget.id}')">
        <div class="data-card-top">
          <span class="data-card-title">${budget.name}</span>
          <span class="action-icon-group" onclick="event.stopPropagation()">
            ${canEdit ? btnIconEdit(`window.editBudgetPlan('${budget.id}')`) : ''}
            ${canDelete ? btnIconDelete(`window.deleteBudgetPlan('${budget.id}')`) : ''}
          </span>
        </div>
        ${cardRow('Status', statusBadge)}
        ${cardRow('Budgeted', `$${totalBudgetedUSD.toFixed(2)}`)}
        ${cardRow('Spent', `$${totalSpentUSD.toFixed(2)}`)}
        ${cardRow('Remaining', `$${remaining.toFixed(2)}`, isOver ? 'negative' : 'positive')}
        ${cardRow('Health', healthBadge)}
      </article>
    `;
  });

  const grandRemaining = grandTotalBudgeted - grandTotalSpent;
  const grandOver = grandRemaining < 0;

  tableRows += `
    <tr class="status-total">
      <td data-label="Total"><strong>GRAND TOTAL</strong></td>
      <td data-label=""></td>
      <td data-label="Budgeted"><strong>$${grandTotalBudgeted.toFixed(2)}</strong></td>
      <td data-label="Spent"><strong>$${grandTotalSpent.toFixed(2)}</strong></td>
      <td data-label="Remaining" class="${grandOver ? 'negative' : 'positive'}"><strong>$${grandRemaining.toFixed(2)}</strong></td>
      <td data-label=""></td>
      <td data-label=""></td>
    </tr>
  `;

  mobileCards += `
    <article class="data-card data-card--total">
      <div class="data-card-top">
        <span class="data-card-title">Grand Total</span>
      </div>
      ${cardRow('Budgeted', `$${grandTotalBudgeted.toFixed(2)}`)}
      ${cardRow('Spent', `$${grandTotalSpent.toFixed(2)}`)}
      ${cardRow('Remaining', `$${grandRemaining.toFixed(2)}`, grandOver ? 'negative' : 'positive')}
    </article>
  `;

  container.innerHTML = `
    <div class="card">
      <h2>📊 Budget Summary</h2>
      <div class="table-container show-desktop">
        <table class="table-stack-mobile">
          <thead>
            <tr>
              <th>Budget</th>
              <th>Status</th>
              <th>Total Budgeted (USD)</th>
              <th>Total Spent (USD)</th>
              <th>Remaining (USD)</th>
              <th>Health</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
      <div class="show-mobile data-card-list">${mobileCards}</div>
      <p style="margin-top: 15px; color: #666; font-size: 0.9em;">Tap a budget to view detailed category breakdown.</p>
    </div>
  `;
}

function renderBudgetDetailCards(container, budgets) {
  let html = '';

  budgets.forEach(budget => {
    let totalBudgetedUSD = 0;
    let totalSpentUSD = 0;
    let categoriesHtml = '';
    const budgetStatus = budget.status || 'current';

    let statusBadge = '';
    if (budgetStatus === 'draft') statusBadge = '<span class="badge badge-secondary">Draft</span>';
    else if (budgetStatus === 'archive') statusBadge = '<span class="badge badge-info">Archive</span>';
    else statusBadge = '<span class="badge badge-success">Current</span>';

    (budget.categories || []).forEach(cat => {
      const budgetedUSD = cat.usdAmount || cat.usd_amount || 0;
      totalBudgetedUSD += budgetedUSD;

      const spentUSD = 0;
      totalSpentUSD += spentUSD;

      const remainingUSD = budgetedUSD - spentUSD;
      const percent = budgetedUSD > 0 ? (spentUSD / budgetedUSD * 100) : 0;

      let progressClass = '';
      if (percent > 90) progressClass = 'danger';
      else if (percent > 75) progressClass = 'warning';

      const localAmtVal = cat.localAmount || cat.local_amount || 0;
      const localDisplay = localAmtVal
        ? `${localAmtVal.toLocaleString()} ${cat.currency}`
        : '';
      const rateDisplay = cat.rate ? ` @ ${cat.rate}` : '';

      categoriesHtml += `
        <div class="budget-line-card">
          <div class="budget-line-card-title">${cat.name}</div>
          ${cardRow('Budgeted', `$${budgetedUSD.toFixed(2)} USD${localDisplay ? ' = ' + localDisplay + rateDisplay : ''}`)}
          ${cardRow('Spent', `$${spentUSD.toFixed(2)}`)}
          ${cardRow('Remaining', `$${remainingUSD.toFixed(2)} (${percent.toFixed(1)}%)`)}
          <div class="progress-bar" style="height: 15px; margin-top: 8px;">
            <div class="progress-fill ${progressClass}" style="width: ${Math.min(percent, 100)}%"></div>
          </div>
        </div>
      `;
    });

    const totalRemaining = totalBudgetedUSD - totalSpentUSD;
    const totalPercent = totalBudgetedUSD > 0 ? (totalSpentUSD / totalBudgetedUSD * 100) : 0;
    const isOverBudget = totalRemaining < 0;

    const canEdit = state.canEditBudgets;
    const canDelete = state.canDeleteBudgets;

    html += `
      <div class="budget-plan-card">
        <h3>
          <span>${budget.name} ${statusBadge}</span>
          <span class="action-icon-group">
            ${canEdit ? btnIconEdit(`window.editBudgetPlan('${budget.id}')`) : ''}
            ${canDelete ? btnIconDelete(`window.deleteBudgetPlan('${budget.id}')`) : ''}
          </span>
        </h3>
        <div class="budget-plan-stats">
          <div class="budget-plan-stat">
            <div class="value">$${totalBudgetedUSD.toFixed(2)}</div>
            <div class="label">Total Budgeted</div>
          </div>
          <div class="budget-plan-stat">
            <div class="value">$${totalSpentUSD.toFixed(2)}</div>
            <div class="label">Total Spent</div>
          </div>
          <div class="budget-plan-stat">
            <div class="value" style="color: ${isOverBudget ? '#dc3545' : '#28a745'}">$${totalRemaining.toFixed(2)}</div>
            <div class="label">Remaining</div>
          </div>
          <div class="budget-plan-stat">
            <div class="value">${totalPercent.toFixed(1)}%</div>
            <div class="label">Used</div>
          </div>
        </div>
        <h4 style="margin: 20px 0 15px;">Category Breakdown</h4>
        ${categoriesHtml}
      </div>
    `;
  });

  container.innerHTML = html;
}

window.viewBudgetDetail = function(budgetId) {
  const statusFilter = document.getElementById('budgetFilterStatus');
  const nameFilter = document.getElementById('budgetFilterName');
  if (statusFilter) statusFilter.value = 'all';
  if (nameFilter) nameFilter.value = budgetId;
  initViewBudgetsPage();
};

// ========== EDIT BUDGET ==========
window.editBudgetPlan = async function(id) {
  if (!state.canEditBudgets) {
    showToast('You do not have permission to edit budgets', 'error');
    return;
  }

  const allBudgets = state.budgetPlans || state._budgets || [];
  const budget = normalizeBudgetPlan(allBudgets.find(b => b.id === id));
  if (!budget) {
    showToast('Budget not found', 'error');
    return;
  }

  document.getElementById('editBudgetId').value = budget.id;
  document.getElementById('editBudgetName').value = budget.name;
  document.getElementById('editBudgetStatus').value = budget.status || 'current';
  document.getElementById('editBudgetStatus').dataset.originalStatus = budget.status || 'current';

  const container = document.getElementById('editBudgetCategoriesContainer');
  container.innerHTML = '';

  const cats = (budget.categories || []).map(normalizeBudgetCategory);
  cats.forEach(cat => {
    if (typeof window.addEditCategoryRow === 'function') {
      window.addEditCategoryRow(cat, { deferPopulate: true });
    }
  });

  await populateEditBudgetRows();

  const rows = container.querySelectorAll('.category-row');
  rows.forEach((row, idx) => {
    const cat = cats[idx];
    if (!cat) return;

    const catCurrency = cat.currency || '';
    const catUsd = cat.usd_amount ?? cat.usdAmount ?? '';
    const catLocal = cat.local_amount ?? cat.localAmount ?? '';
    const catRate = cat.rate || '';

    const currSelect = row.querySelector('.edit-budget-cat-currency');
    if (currSelect && catCurrency) currSelect.value = catCurrency;
    const usdEl = row.querySelector('.edit-budget-cat-usd');
    if (usdEl) usdEl.value = catUsd;
    const localEl = row.querySelector('.edit-budget-cat-local');
    if (localEl) localEl.value = formatLocalInput(catLocal);
    const rateEl = row.querySelector('.edit-budget-cat-rate');
    if (rateEl) rateEl.value = catRate;
  });

  const isDraft = (budget.status || 'current') === 'draft';
  rows.forEach(row => {
    row.querySelector('.edit-budget-cat-rate').readOnly = !isDraft;
    row.querySelector('.edit-budget-cat-currency').disabled = !isDraft;
    const nameInput = row.querySelector('.edit-budget-cat-name-input');
    if (nameInput) nameInput.readOnly = !isDraft;
    if (!isDraft) {
      const removeBtn = row.querySelector('.cat-remove-btn');
      if (removeBtn) removeBtn.style.display = 'none';
    }
  });

  const addBtn = document.getElementById('addEditCatBtn');
  if (addBtn) addBtn.style.display = isDraft ? 'inline-block' : 'none';

  const note = document.getElementById('editBudgetRateNote');
  if (note) {
    note.textContent = isDraft
      ? 'USD amounts are primary. Select currency to auto-fill rate. Local amount auto-calculates.'
      : '⚠️ This budget is not in Draft status. Categories, currencies, and rates are locked. You can only edit the budget name and status.';
    note.style.color = isDraft ? '#666' : '#856404';
  }

  const saveBtn = document.getElementById('saveEditBudgetBtn') || document.querySelector('#editBudgetModal button[type="submit"]');
  if (saveBtn) {
    saveBtn.textContent = 'Save Changes';
    saveBtn.disabled = false;
  }
  
  document.getElementById('editBudgetModal').classList.add('active');
};

async function populateEditBudgetRows() {
  const container = document.getElementById('editBudgetCategoriesContainer');
  if (!container) return;
  
  const rows = container.querySelectorAll('.category-row');

  rows.forEach(row => {
    const currSelect = row.querySelector('.edit-budget-cat-currency');
    const currentCurr = currSelect ? (currSelect.getAttribute('data-selected') || currSelect.value) : '';

    if (currSelect) {
      currSelect.innerHTML = '<option value="">Currency</option>';
      const uniqueCurrencies = getLocalCurrenciesFromRates(state.exchangeRates || []);
      uniqueCurrencies.forEach(c => {
        const isSelected = c === currentCurr ? 'selected' : '';
        currSelect.innerHTML += `<option value="${c}" ${isSelected}>${c}</option>`;
      });
      const isUsdSelected = currentCurr === 'USD' ? 'selected' : '';
      currSelect.innerHTML += `<option value="USD" ${isUsdSelected}>USD</option>`;
      if (currentCurr) currSelect.value = currentCurr;
    }
  });
}

window.addEditCategoryRow = function(categoryData = null, options = {}) {
  const container = document.getElementById('editBudgetCategoriesContainer');
  if (!container) return;

  const normalized = categoryData ? normalizeBudgetCategory(categoryData) : null;
  const isTemplate = normalized ? isTemplateBudgetRow(normalized.category, normalized.subcategory) : false;
  const isCustom = !categoryData || (!isTemplate && !normalized?.category);

  const displayName = normalized ? normalized.name : (categoryData?.name || '');
  const catUsd = categoryData ? (categoryData.usd_amount ?? categoryData.usdAmount ?? '') : '';
  const catCurrency = categoryData ? (categoryData.currency || '') : '';
  const catRate = categoryData ? (categoryData.rate || '') : '';
  const catLocal = categoryData ? formatLocalInput(categoryData.local_amount ?? categoryData.localAmount ?? '') : '';

  const removeBtn = isTemplate
    ? ''
    : `<div class="line-card-header">
        <span class="line-card-header-label">${escapeHtmlAttr(displayName) || 'Category'}</span>
        ${btnIconDelete('window.removeEditCategoryRow(this)', 'Remove')}
      </div>`;

  let nameFields;
  if (isTemplate || (normalized && normalized.category && !isCustom)) {
    nameFields = `
      <input type="hidden" class="edit-budget-cat-category" value="${escapeHtmlAttr(normalized?.category || '')}">
      <input type="hidden" class="edit-budget-cat-subcategory" value="${escapeHtmlAttr(normalized?.subcategory || '')}">
      <input type="hidden" class="edit-budget-cat-name-value" value="${escapeHtmlAttr(displayName)}">
      ${isTemplate ? `<div class="budget-line-card-title">${escapeHtmlAttr(displayName)}</div>` : ''}`;
  } else {
    nameFields = `
      <div class="field-labeled"><span>Category</span>
        <input type="text" class="edit-budget-cat-name-input" value="${escapeHtmlAttr(displayName)}" required placeholder="Category name">
      </div>`;
  }

  const row = document.createElement('div');
  row.className = 'budget-line-card category-row';
  if (isTemplate) row.dataset.template = 'true';
  if (isCustom && categoryData) row.dataset.custom = 'true';

  row.innerHTML = `
    <div class="edit-budget-cat-name-cell">${nameFields}</div>
    <div class="field-labeled"><span>USD Amount</span>
      <input type="number" class="edit-budget-cat-usd" step="0.01" placeholder="USD" value="${catUsd}" required oninput="window.onEditBudgetUSDChange(this)">
    </div>
    <div class="field-labeled"><span>Currency</span>
      <select class="edit-budget-cat-currency" required onchange="window.onEditBudgetCurrencyChange(this)" data-selected="${escapeHtmlAttr(catCurrency)}">
        <option value="">Currency</option>
      </select>
    </div>
    <div class="field-labeled"><span>Exchange Rate</span>
      <input type="number" class="edit-budget-cat-rate" step="0.000001" placeholder="Rate" value="${catRate}" oninput="window.onEditBudgetRateChange(this)">
    </div>
    <div class="field-labeled"><span>Local Amount</span>
      <input type="number" class="edit-budget-cat-local" step="0.01" placeholder="Local" value="${catLocal}" readonly>
    </div>
    ${removeBtn}
  `;
  container.appendChild(row);

  if (!options.deferPopulate && typeof populateEditBudgetRows === 'function') {
    populateEditBudgetRows();
  }
};

window.onEditBudgetUSDChange = function(usdInput) {
  const row = usdInput.closest('.category-row');
  if (!row) return;
  recalculateEditBudgetLocal(row);
};

window.onEditBudgetCurrencyChange = function(currencySelect) {
  const row = currencySelect.closest('.category-row');
  if (!row) return;
  const currency = currencySelect.value;
  const rateInput = row.querySelector('.edit-budget-cat-rate');
  if (!currency || !rateInput) return;

  if (currency === 'USD') {
    rateInput.value = '1';
    recalculateEditBudgetLocal(row);
    return;
  }

  const rates = state.exchangeRates || [];
  const currencyRates = rates
    .filter(r => r.currency === currency && !r.is_deleted)
    .sort((a, b) => new Date(b.date || b.created_at) - new Date(a.date || a.created_at));

  if (currencyRates.length > 0) {
    rateInput.value = currencyRates[0].rate;
  } else {
    rateInput.value = '';
  }
  recalculateEditBudgetLocal(row);
};

window.onEditBudgetRateChange = function(rateInput) {
  const row = rateInput.closest('.category-row');
  if (!row) return;
  recalculateEditBudgetLocal(row);
};

function recalculateEditBudgetLocal(row) {
  const usdInput = row.querySelector('.edit-budget-cat-usd');
  const rateInput = row.querySelector('.edit-budget-cat-rate');
  const localInput = row.querySelector('.edit-budget-cat-local');
  if (!usdInput || !rateInput || !localInput) return;

  const usdAmount = parseFloat(usdInput.value) || 0;
  const rate = parseFloat(rateInput.value) || 0;

  if (usdAmount > 0 && rate > 0) {
    localInput.value = (usdAmount / rate).toFixed(2);
  } else {
    localInput.value = '';
  }
}

window.validateEditBudgetName = function(input) {
  const newName = input.value.trim();
  if (!newName) return;

  const id = document.getElementById('editBudgetId').value;
  const allBudgets = state.budgetPlans || [];
  const teamId = state.currentTeam?.team_id;
  const duplicate = allBudgets.find(b => b.name.toLowerCase().trim() === newName.toLowerCase() && b.team_id === teamId && b.id !== id && !b.is_deleted);

  if (duplicate) {
    input.style.borderColor = '#dc3545';
    showToast('A budget with this name already exists in your team', 'warning');
  } else {
    input.style.borderColor = '';
  }
};

window.saveEditedBudget = async function() {
  if (!state.canEditBudgets) {
    showToast('You do not have permission to edit budgets', 'error');
    return;
  }

  const id = document.getElementById('editBudgetId').value;
  const allBudgets = state.budgetPlans || state._budgets || [];
  const budgetIndex = allBudgets.findIndex(b => b.id === id);
  if (budgetIndex === -1) {
    showToast('Budget not found', 'error');
    return;
  }

  const newName = document.getElementById('editBudgetName').value.trim();
  const newStatus = document.getElementById('editBudgetStatus').value;

  if (!newName) {
    showToast('Please enter a budget name', 'error');
    return;
  }

  const teamId = state.currentTeam?.team_id;
  const duplicate = allBudgets.find(b => b.name.toLowerCase().trim() === newName.toLowerCase() && b.team_id === teamId && b.id !== id && !b.is_deleted);
  if (duplicate) {
    showToast('A budget with this name already exists in your team', 'error');
    return;
  }

  const categories = [];
  const rows = document.querySelectorAll('#editBudgetCategoriesContainer .category-row');

  rows.forEach(row => {
    const catName = getEditRowCategoryName(row);
    const usdStr = row.querySelector('.edit-budget-cat-usd')?.value;
    const localStr = row.querySelector('.edit-budget-cat-local')?.value;
    const currSelect = row.querySelector('.edit-budget-cat-currency');
    const rateStr = row.querySelector('.edit-budget-cat-rate')?.value;

    const currency = currSelect ? (currSelect.value || currSelect.getAttribute('data-selected')) : '';
    const usdAmount = parseFloat(usdStr) || 0;
    const rate = parseFloat(rateStr) || 0;
    const localAmount = parseFloat(localStr) || 0;

    if (catName && currency) {
      categories.push({
        name: catName,
        category: row.querySelector('.edit-budget-cat-category')?.value || undefined,
        subcategory: row.querySelector('.edit-budget-cat-subcategory')?.value || null,
        usdAmount,
        localAmount: localAmount || (currency === 'USD' ? usdAmount : usdToLocal(usdAmount, rate || 1)),
        currency,
        rate: rate || (currency === 'USD' ? 1 : 0)
      });
    }
  });

  if (categories.length === 0) {
    showToast('Please add at least one category with USD amount', 'error');
    return;
  }

  const totalAmount = categories.reduce((sum, c) => sum + c.usdAmount, 0);

  // Re-build the full record structure so the local offline DB doesn't lose properties
  const existingRecord = allBudgets[budgetIndex] || {};
  const updateData = {
    ...existingRecord,
    name: newName,
    status: newStatus,
    categories: categories,
    total_amount: totalAmount,
    updated_at: new Date().toISOString()
  };

  const btn = document.getElementById('saveEditBudgetBtn') || document.querySelector('#editBudgetModal button[type="submit"]');
  if (btn) {
    btn.textContent = 'Saving...';
    btn.disabled = true;
  }

  try {
    // 1. Update remote Cloud Database (Supabase)
    const result = await sbUpdate('budget_plans', id, updateData);
    if (result && result.error) {
      throw new Error(result.error.message || 'Supabase update failed');
    }

    // 2. FORCE OFFLINE CACHE SYNCHRONIZATION via localPut
    if (typeof localPut === 'function') {
      await localPut('budget_plans', updateData);
    }

    // 3. Sync transient memory state array
    const all = await localGetAll('budget_plans');
    state.budgetPlans = all.filter(b => b.team_id === teamId && !b.is_deleted);

    if (btn) {
      btn.textContent = 'Save Changes';
      btn.disabled = false;
    }

    // 4. Refresh view layout
    initViewBudgetsPage();

    showToast('Budget updated successfully!', 'success');
    document.getElementById('editBudgetModal').classList.remove('active');

  } catch (error) {
    console.error('Edit budget error:', error);
    showToast(`Failed to update budget: ${error.message}`, 'error');
    
    if (btn) {
      btn.textContent = 'Save Changes';
      btn.disabled = false;
    }
    
    let errorBanner = document.getElementById('editBudgetErrorBanner');
    if (!errorBanner) {
      errorBanner = document.createElement('div');
      errorBanner.id = 'editBudgetErrorBanner';
      errorBanner.style.color = '#721c24';
      errorBanner.style.backgroundColor = '#f8d7da';
      errorBanner.style.padding = '10px';
      errorBanner.style.marginTop = '10px';
      errorBanner.style.borderRadius = '4px';
      const modalContent = document.querySelector('#editBudgetModal .modal-content');
      if (modalContent) modalContent.prepend(errorBanner);
    }
    errorBanner.textContent = `⚠️ Critical Error: ${error.message}`;
  }
};

window.removeEditCategoryRow = function(btn) {
  const container = document.getElementById('editBudgetCategoriesContainer');
  if (!container) return;
  if (container.children.length > 1) {
    btn.closest('.category-row').remove();
  } else {
    showToast('Budget must have at least one category', 'warning');
  }
};

window.closeEditBudgetModal = function() {
  document.getElementById('editBudgetModal').classList.remove('active');
};

// ========== DELETE BUDGET ==========
window.deleteBudgetPlan = async function(id) {
  if (!state.canDeleteBudgets) {
    showToast('You do not have permission to delete budgets', 'error');
    return;
  }

  const allBudgets = state.budgetPlans || [];
  const budget = allBudgets.find(b => b.id === id);
  if (!budget) {
    showToast('Budget not found', 'error');
    return;
  }

  const expenseCount = 0;

  let msg = `Delete budget "${budget.name}"?`;
  if (expenseCount > 0) {
    msg += `\n\n⚠️ This budget has ${expenseCount} expense(s) recorded. They will remain but won't be linked to any budget.`;
  }

  showConfirm(msg.replace(/\n/g, '<br>'), async () => {
    try {
      const result = await sbSoftDelete('budget_plans', id);
      if (result && !result.error) {
        showToast(`Budget "${budget.name}" deleted`, 'success');
        const teamId = state.currentTeam?.team_id;
        const all = await localGetAll('budget_plans');
        state.budgetPlans = all.filter(b => b.team_id === teamId && !b.is_deleted);
        initViewBudgetsPage();
      } else {
        showToast(result?.error?.message || 'Failed to delete budget', 'error');
      }
    } catch (err) {
      console.error('Delete budget error:', err);
      showToast('Failed to delete budget', 'error');
    }
  });
};

window.addEventListener('click', function(event) {
  const editBudgetModal = document.getElementById('editBudgetModal');
  if (event.target === editBudgetModal) {
    window.closeEditBudgetModal();
  }
});