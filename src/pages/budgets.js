/* ========== BUDGET PLANS CRUD ========== */
import { state } from '../state.js';
import { supabaseClient, localGetAll, localPut, sbInsert, sbUpdate, sbSoftDelete, sbSelect } from '../db.js';
import { showToast, showConfirm } from '../components/toasts.js';
import {
  getLatestUsdRate,
  getLocalCurrenciesFromRates,
  localToUsd,
  rateForInput,
  roundUsd
} from '../utils/currency.js';
import { loadCategoryMasterLines, normalizeBudgetCategory, formatCategoryLabel } from '../utils/categoryMaster.js';
import { formatDisplayDate, isDateCnBudgetName, DATE_CN_BUDGET_NAME_WARNING, filterOpenCalendarEntries, isCalendarEntryOpen } from '../utils/budgetCalendar.js';
import {
  isMonthlyBudgetType,
  isNamedBudgetType,
  getBudgetTypeConfig,
  getBudgetTypeLabel,
  buildBudgetTypeOptionsHtml
} from '../utils/budgetTypes.js';
import { btnIconEdit, btnIconDelete, cardRow } from '../utils/uiHelpers.js';
import { canSubmitBudgetApproval } from '../utils/approvalAccess.js';
import { submitBudgetForApproval } from '../utils/approvalEngine.js';
import { isSystemAdmin } from '../utils/navPermissions.js';
import {
  BUDGET_STATUS,
  getBudgetStatus,
  budgetStatusBadgeHtml,
  budgetStatusOptionsHtml,
  canEditBudgetLines,
  canOpenBudgetEditor,
  canArchiveBudget,
  canSubmitBudgetByStatus
} from '../utils/budgetStatus.js';

let calendarEntriesCache = [];
let editTemplateRowKeys = null;
/** Active form mode: 'create' | 'edit' */
let budgetFormMode = 'create';
let launchWizardAfterCreate = false;
let launchWizardAfterEdit = false;

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

export function normalizeBudgetPlan(budget) {
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
    <div class="card">
      <form id="createBudgetForm" onsubmit="window.createBudget(event)">
        <div class="form-stack">
          <div class="form-grid-row form-grid-row--budget-header">
            <div class="form-group budget-type-first">
              <label>Budget Type *</label>
              <select id="newBudgetType" required onchange="window.onBudgetTypeChange()">
                ${buildBudgetTypeOptionsHtml('monthly')}
              </select>
            </div>

            <div class="form-group" id="copyBudgetGroup">
              <label>Copy Categories from Previous Budget</label>
              <select id="copyBudgetSelect" onchange="window.copyPreviousBudgetPlan(this)">
                <option value="">— Select a budget to copy —</option>
              </select>
            </div>

            <div class="form-group" id="monthlyCalendarGroup">
              <label>Budget Period Date *</label>
              <select id="newBudgetCalendarEntry" onchange="window.onBudgetCalendarEntryChange()"><option value="">Select date…</option></select>
              <p id="monthlyCalendarEmptyHint" class="form-hint" style="display:none; color:#856404;">No open calendar periods. Ask an org admin to open a period in Budget Calendar.</p>
            </div>
            <div class="form-group" id="namedPeriodGroup" style="display:none;">
              <label>Budget Period Date *</label>
              <input type="date" id="newBudgetPeriodDate">
            </div>

            <div class="form-group" id="monthlyNameGroup">
              <label>Budget Name</label>
              <input type="text" id="newBudgetName" placeholder="Select a calendar period date" readonly>
            </div>
            <div class="form-group" id="budgetNameGroup" style="display:none;">
              <label>Budget Name *</label>
              <input type="text" id="newBudgetNameNamed" placeholder="Enter a descriptive name" onblur="window.validateBudgetName(this)">
              <p id="namedBudgetNameHint" class="form-hint"></p>
            </div>
          </div>
          <p id="budgetTypeHint" class="form-hint">Monthly budgets are tied to the org calendar; other types use a custom name for your team.</p>

          <div class="form-grid-row form-grid-row--budget-b">
            <div class="form-group">
              <label>Status</label>
              <select id="newBudgetStatus" required>${budgetStatusOptionsHtml('draft', { forCreate: true })}</select>
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
          <p class="form-hint">1 USD = X local currency. Enter local amounts; USD is calculated from this rate.</p>
        </div>

        <h3 style="margin-top: 25px;">Categories &amp; Amounts</h3>
        <p class="page-intro" id="budgetLineUsdHint">Enter local amounts. USD uses the currency and exchange rate above.</p>

        <div class="budget-line-table-wrap show-desktop">
          <div class="budget-line-table-head">
            <span>Category</span>
            <span>Local Amount</span>
            <span>USD Amount</span>
            <span></span>
          </div>
        </div>
        <div id="budgetCategoriesContainer" class="budget-line-cards"></div>

        <div class="budget-grand-total-card">
          ${cardRow('Total Local', '<span id="createBudgetTotalLocal">0.00</span>')}
          ${cardRow('Total USD', '<span id="createBudgetTotalUsd">0.00</span>')}
        </div>

        <div class="btn-group">
          <button type="button" class="secondary" onclick="window.addCategoryRow()">+ Add Category</button>
          <button type="submit" id="createBudgetSaveBtn">Save Budget</button>
          <button type="button" class="success" id="createBudgetSaveSubmitBtn" onclick="window.createBudgetAndSubmit(event)">Save &amp; Submit</button>
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

  window.onBudgetTypeChange = onBudgetTypeChange;
  window.onBudgetCalendarEntryChange = onBudgetCalendarEntryChange;
  window.onCreateBudgetCurrencyChange = onCreateBudgetCurrencyChange;
  window.onCreateBudgetRateChange = onCreateBudgetRateChange;
  window.onCreateBudgetLocalChange = onCreateBudgetLocalChange;
  window.createBudgetAndSubmit = function(e) {
    if (e) e.preventDefault();
    launchWizardAfterCreate = true;
    const form = document.getElementById('createBudgetForm');
    if (form) form.requestSubmit();
  };
  window.copyPreviousBudgetPlan = async function(select) {
    const budgetId = select.value;
    if (!budgetId) return;
    try {
      const { data: budget, error } = await supabaseClient
        .from('budget_plans')
        .select('categories')
        .eq('id', budgetId)
        .single();
      if (error) throw error;
      const categories = parseBudgetCategories(budget.categories);
      if (!categories.length) {
        showToast('Selected budget has no categories to copy', 'warning');
        return;
      }
      const container = document.getElementById('budgetCategoriesContainer');
      if (container) {
        container.innerHTML = '';
        categories.forEach(cat => {
          const displayName = formatCategoryLabel(cat.category, cat.subcategory);
          const row = document.createElement('div');
          row.className = 'budget-line-card category-row';
          if (!cat.category) row.dataset.custom = 'true';
          else row.dataset.template = 'true';
          row.innerHTML = buildCategoryRowHtml({
            displayName,
            category: cat.category || '',
            subcategory: cat.subcategory || '',
            localVal: formatLocalInput(cat.localAmount ?? cat.local_amount ?? ''),
            usdVal: Number(cat.usdAmount ?? cat.usd_amount ?? 0).toFixed(2),
            isTemplate: !!cat.category,
            isCustom: !cat.category
          });
          container.appendChild(row);
        });
        recalculateAllBudgetUsdFromLocal('#budgetCategoriesContainer', getCreateBudgetHeaderCurrency);
        showToast(`Copied ${categories.length} categories!`, 'success');
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to copy categories', 'error');
    }
  };

  const teamId = state.currentTeam?.team_id;
  if (teamId) {
    supabaseClient
      .from('budget_plans')
      .select('id, name')
      .eq('team_id', teamId)
      .eq('is_deleted', false)
      .in('status', ['approved', 'received', 'closed'])
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        const select = document.getElementById('copyBudgetSelect');
        if (select) {
          select.innerHTML = '<option value="">— Select a budget to copy —</option>';
          (data || []).forEach(b => {
            select.innerHTML += `<option value="${b.id}">${escapeHtmlAttr(b.name)}</option>`;
          });
        }
      });
  }

  budgetFormMode = 'create';
  await onBudgetTypeChange();
  updateBudgetLineAmountHint();
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
  const openEntries = filterOpenCalendarEntries(calendarEntriesCache);
  const emptyHint = document.getElementById('monthlyCalendarEmptyHint');

  select.innerHTML = '<option value="">Select date…</option>';
  openEntries.forEach(entry => {
    const label = entry.label
      ? `${formatDisplayDate(entry.budget_period_date)} — ${entry.label}`
      : formatDisplayDate(entry.budget_period_date);
    const safeLabel = escapeHtmlAttr(entry.label || '');
    select.innerHTML += `<option value="${entry.id}" data-label="${safeLabel}" data-date="${entry.budget_period_date}">${label}</option>`;
  });

  if (openEntries.some(e => e.id === current)) {
    select.value = current;
  } else {
    select.value = '';
  }

  if (emptyHint) {
    emptyHint.style.display = openEntries.length ? 'none' : '';
  }

  select.disabled = openEntries.length === 0;
  onBudgetCalendarEntryChange();
}

function getMonthlyBudgetNameFromEntry(entry) {
  if (!entry) return '';
  if (entry.label?.trim()) return entry.label.trim();
  return formatDisplayDate(entry.budget_period_date);
}

function onBudgetCalendarEntryChange() {
  const type = document.getElementById('newBudgetType')?.value || 'monthly';
  if (!isMonthlyBudgetType(type)) return;

  const entryId = document.getElementById('newBudgetCalendarEntry')?.value;
  const nameInput = document.getElementById('newBudgetName');
  if (!nameInput) return;

  const entry = calendarEntriesCache.find(e => e.id === entryId);
  nameInput.value = getMonthlyBudgetNameFromEntry(entry);
}

async function onBudgetTypeChange() {
  const type = document.getElementById('newBudgetType')?.value || 'monthly';
  const config = getBudgetTypeConfig(type);
  const calSelect = document.getElementById('newBudgetCalendarEntry');
  const periodInput = document.getElementById('newBudgetPeriodDate');
  const monthlyNameInput = document.getElementById('newBudgetName');
  const namedNameInput = document.getElementById('newBudgetNameNamed');
  const namedHint = document.getElementById('namedBudgetNameHint');
  const typeHint = document.getElementById('budgetTypeHint');
  const monthlyCal = document.getElementById('monthlyCalendarGroup');
  const namedPeriod = document.getElementById('namedPeriodGroup');
  const monthlyName = document.getElementById('monthlyNameGroup');
  const namedName = document.getElementById('budgetNameGroup');

  if (typeHint) {
    typeHint.textContent = isMonthlyBudgetType(type)
      ? 'Monthly budgets use open org calendar periods only; the name is shared across all teams.'
      : `${config.label} budgets use a custom name and period date for your team.`;
  }

  if (isMonthlyBudgetType(type)) {
    if (monthlyCal) monthlyCal.style.display = '';
    if (namedPeriod) namedPeriod.style.display = 'none';
    if (monthlyName) monthlyName.style.display = '';
    if (namedName) namedName.style.display = 'none';
    const openCount = filterOpenCalendarEntries(calendarEntriesCache).length;
    if (calSelect) {
      calSelect.required = openCount > 0;
      calSelect.disabled = openCount === 0;
    }
    if (periodInput) {
      periodInput.required = false;
      periodInput.value = '';
    }
    if (monthlyNameInput) {
      monthlyNameInput.readOnly = true;
      onBudgetCalendarEntryChange();
    }
    if (namedNameInput) namedNameInput.value = '';
  } else {
    if (monthlyCal) monthlyCal.style.display = 'none';
    if (namedPeriod) namedPeriod.style.display = '';
    if (monthlyName) monthlyName.style.display = 'none';
    if (namedName) namedName.style.display = '';
    if (calSelect) {
      calSelect.required = false;
      calSelect.value = '';
    }
    if (periodInput) {
      periodInput.required = true;
      const today = new Date();
      const y = today.getFullYear();
      const m = String(today.getMonth() + 1).padStart(2, '0');
      const d = String(today.getDate()).padStart(2, '0');
      periodInput.value = `${y}-${m}-${d}`;
    }
    if (monthlyNameInput) monthlyNameInput.value = '';
    if (namedNameInput) {
      namedNameInput.readOnly = false;
      namedNameInput.placeholder = config.namePlaceholder || 'Enter a descriptive name';
      if (namedHint) {
        namedHint.textContent = config.nameHint || '';
        namedHint.style.display = config.nameHint ? '' : 'none';
      }
    }
  }

  await seedCreateBudgetCategoryRows();
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
  updateBudgetLineAmountHint();
  recalculateAllBudgetUsdFromLocal('#budgetCategoriesContainer', getCreateBudgetHeaderCurrency);
}

function onCreateBudgetRateChange() {
  recalculateAllBudgetUsdFromLocal('#budgetCategoriesContainer', getCreateBudgetHeaderCurrency);
}

function onCreateBudgetLocalChange() {
  updateCreateBudgetTotals();
}

function updateBudgetLineAmountHint() {
  const hint = document.getElementById('budgetLineUsdHint') || document.getElementById('editBudgetRateNote');
  const { currency } = getActiveHeaderCurrency();
  if (!hint) return;
  if (!currency) {
    hint.textContent = 'Enter local amounts. USD uses the currency and exchange rate above.';
    return;
  }
  if (currency === 'USD') {
    hint.textContent = 'Enter amounts. When currency is USD, local and USD match.';
  } else {
    hint.textContent = `Enter local (${currency}) amounts. USD is calculated from the exchange rate above.`;
  }
}

function updateCreateBudgetTotals() {
  updateBudgetFormTotals('#budgetCategoriesContainer', 'createBudgetTotalUsd', 'createBudgetTotalLocal');
}

function updateBudgetFormTotals(containerSel, usdId, localId) {
  const rows = document.querySelectorAll(`${containerSel} .category-row`);
  let totalUsd = 0;
  let totalLocal = 0;

  rows.forEach(row => {
    const usd = parseFloat(row.querySelector('.budget-cat-usd')?.value) || 0;
    const local = parseFloat(row.querySelector('.budget-cat-local')?.value) || 0;
    totalUsd += usd;
    totalLocal += local;
  });

  const usdEl = document.getElementById(usdId);
  const localEl = document.getElementById(localId);
  if (usdEl) usdEl.textContent = totalUsd.toFixed(2);
  if (localEl) localEl.textContent = totalLocal.toFixed(2);
}

function getCreateBudgetHeaderCurrency() {
  const currency = document.getElementById('newBudgetCurrency')?.value || '';
  const rateRaw = parseFloat(document.getElementById('newBudgetRate')?.value);
  const rate = Number.isFinite(rateRaw)
    ? rateRaw
    : (currency === 'USD' ? 1 : 0);
  return { currency, rate };
}

function getEditBudgetHeaderCurrency() {
  const currency = document.getElementById('editBudgetCurrency')?.value || '';
  const rateRaw = parseFloat(document.getElementById('editBudgetRate')?.value);
  const rate = Number.isFinite(rateRaw)
    ? rateRaw
    : (currency === 'USD' ? 1 : 0);
  return { currency, rate };
}

function getActiveHeaderCurrency() {
  return budgetFormMode === 'edit'
    ? getEditBudgetHeaderCurrency()
    : getCreateBudgetHeaderCurrency();
}

function buildCategoryRowHtml({ displayName, category, subcategory, localVal = '0', usdVal = '0', isTemplate = false, isCustom = false }) {
  const remove = isTemplate
    ? '<div class="budget-line-card-actions"></div>'
    : `<div class="budget-line-card-actions">${btnIconDelete('window.removeBudgetCategoryRow(this)', 'Remove')}</div>`;

  const title = isCustom
    ? `<div class="budget-line-card-title"><input type="text" class="budget-cat-name" required placeholder="Category name" value="${escapeHtmlAttr(displayName)}"></div>`
    : `<input type="hidden" class="budget-cat-category" value="${escapeHtmlAttr(category || '')}">
       <input type="hidden" class="budget-cat-subcategory" value="${escapeHtmlAttr(subcategory || '')}">
       <input type="hidden" class="budget-cat-name-value" value="${escapeHtmlAttr(displayName)}">
       <div class="budget-line-card-title">${escapeHtmlAttr(displayName)}</div>`;

  return `
    ${title}
    <div class="field-labeled"><span>Local Amount</span>
      <input type="number" class="budget-cat-local" step="0.01" value="${escapeHtmlAttr(localVal)}" min="0" oninput="window.onBudgetLocalChange(this)">
    </div>
    <div class="field-labeled"><span>USD Amount</span>
      <input type="number" class="budget-cat-usd" step="0.01" value="${escapeHtmlAttr(usdVal)}" min="0" readonly>
    </div>
    ${remove}
  `;
}

function buildCreateCategoryRow(line) {
  const displayName = formatCategoryLabel(line.category, line.subcategory);
  const row = document.createElement('div');
  row.className = 'budget-line-card category-row';
  row.dataset.template = 'true';
  row.innerHTML = buildCategoryRowHtml({
    displayName,
    category: line.category,
    subcategory: line.subcategory,
    isTemplate: true
  });
  return row;
}

async function seedCreateBudgetCategoryRows() {
  const container = document.getElementById('budgetCategoriesContainer');
  if (!container) return;

  container.innerHTML = '';
  const type = document.getElementById('newBudgetType')?.value || 'monthly';
  const lines = await loadCategoryMasterLines();

  if (isMonthlyBudgetType(type)) {
    const mandatoryLines = lines.filter(line => line.is_mandatory);
    mandatoryLines.forEach(line => container.appendChild(buildCreateCategoryRow(line)));
  }

  recalculateAllBudgetUsdFromLocal('#budgetCategoriesContainer', getCreateBudgetHeaderCurrency);
}

window.addCategoryRow = function() {
  const container = document.getElementById('budgetCategoriesContainer');
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'budget-line-card category-row';
  row.dataset.custom = 'true';
  row.innerHTML = buildCategoryRowHtml({ displayName: '', isCustom: true });
  container.appendChild(row);
  recalculateBudgetUsdFromLocal(row, getCreateBudgetHeaderCurrency());
};

window.removeBudgetCategoryRow = function(btn) {
  const row = btn.closest('.category-row');
  if (!row) return;
  if (row.dataset.template === 'true') {
    showToast('Template categories cannot be removed', 'warning');
    return;
  }
  const container = row.parentElement;
  row.remove();
  if (container?.id === 'editBudgetCategoriesContainer') {
    updateBudgetFormTotals('#editBudgetCategoriesContainer', 'editBudgetTotalUsd', 'editBudgetTotalLocal');
  } else {
    updateCreateBudgetTotals();
  }
};

window.removeCategoryRow = window.removeBudgetCategoryRow;

window.onBudgetLocalChange = function(localInput) {
  const row = localInput.closest('.category-row');
  if (!row) return;
  const headerFn = row.closest('#editBudgetCategoriesContainer')
    ? getEditBudgetHeaderCurrency
    : getCreateBudgetHeaderCurrency;
  recalculateBudgetUsdFromLocal(row, headerFn());
};

function recalculateAllBudgetUsdFromLocal(containerSel, headerFn) {
  document.querySelectorAll(`${containerSel} .category-row`).forEach(row => {
    recalculateBudgetUsdFromLocal(row, headerFn(), { skipTotals: true });
  });
  if (containerSel.includes('edit')) {
    updateBudgetFormTotals('#editBudgetCategoriesContainer', 'editBudgetTotalUsd', 'editBudgetTotalLocal');
  } else {
    updateCreateBudgetTotals();
  }
}

function recalculateBudgetUsdFromLocal(row, header, options = {}) {
  const usdInput = row.querySelector('.budget-cat-usd');
  const localInput = row.querySelector('.budget-cat-local');
  if (!usdInput || !localInput) return;

  const { currency, rate } = header;
  const localRaw = parseFloat(localInput.value);
  const local = Number.isFinite(localRaw) ? localRaw : 0;
  if (!Number.isFinite(localRaw) || localInput.value === '') {
    localInput.value = '0';
  }

  let usd = 0;
  if (currency === 'USD') {
    usd = local;
  } else if (currency && rate > 0) {
    usd = roundUsd(localToUsd(local, rate));
  }

  usdInput.value = usd.toFixed(2);
  if (!options.skipTotals) {
    if (row.closest('#editBudgetCategoriesContainer')) {
      updateBudgetFormTotals('#editBudgetCategoriesContainer', 'editBudgetTotalUsd', 'editBudgetTotalLocal');
    } else {
      updateCreateBudgetTotals();
    }
  }
}

window.validateBudgetName = function(input) {
  const name = input.value.trim();
  if (!name) return;

  const budgetType = document.getElementById('newBudgetType')?.value || 'monthly';
  if (isNamedBudgetType(budgetType) && isDateCnBudgetName(name)) {
    input.style.borderColor = '#e0a800';
    showToast(DATE_CN_BUDGET_NAME_WARNING, 'warning');
  }

  const existing = state.budgetPlans || [];
  const teamId = state.currentTeam?.team_id;
  const duplicate = existing.find(b => b.name.toLowerCase().trim() === name.toLowerCase() && b.team_id === teamId && !b.is_deleted);

  if (duplicate) {
    input.style.borderColor = '#dc3545';
    showToast('A budget with this name already exists in your team', 'warning');
  } else if (!(isNamedBudgetType(budgetType) && isDateCnBudgetName(name))) {
    input.style.borderColor = '';
  }
};

window.createBudget = async function(e) {
  e.preventDefault();
  if (!state.canCreateBudgets) {
    showToast('You do not have permission to create budgets', 'error');
    return;
  }

  const budgetType = document.getElementById('newBudgetType')?.value || 'monthly';
  const existing = state.budgetPlans || [];
  const teamId = state.currentTeam?.team_id;
  let resolvedName = '';

  let calendar_entry_id = null;
  let budget_period_date = null;

  if (isMonthlyBudgetType(budgetType)) {
    const openEntries = filterOpenCalendarEntries(calendarEntriesCache);
    if (!openEntries.length) {
      showToast('No open calendar periods. Ask an org admin to open a period in Budget Calendar.', 'error');
      return;
    }

    const entryId = document.getElementById('newBudgetCalendarEntry')?.value;
    if (!entryId) {
      showToast('Select an open budget period date from the calendar', 'error');
      return;
    }
    const entry = calendarEntriesCache.find(e => e.id === entryId);
    if (!isCalendarEntryOpen(entry)) {
      showToast('That calendar period is closed. Select an open period.', 'error');
      return;
    }
    calendar_entry_id = entryId;
    budget_period_date = entry?.budget_period_date || null;

    const monthlyName = getMonthlyBudgetNameFromEntry(entry);
    if (!monthlyName) {
      showToast('Selected calendar entry has no label', 'error');
      return;
    }

    const dupPeriod = existing.find(b =>
      b.team_id === teamId &&
      !b.is_deleted &&
      b.budget_type === 'monthly' &&
      b.calendar_entry_id === entryId
    );
    if (dupPeriod) {
      showToast(`This team already has a monthly budget for "${monthlyName}"`, 'error');
      return;
    }

    resolvedName = monthlyName;
    const monthlyNameEl = document.getElementById('newBudgetName');
    if (monthlyNameEl) monthlyNameEl.value = monthlyName;
  } else {
    resolvedName = document.getElementById('newBudgetNameNamed')?.value.trim() || '';
    budget_period_date = document.getElementById('newBudgetPeriodDate')?.value || null;
    if (!budget_period_date) {
      showToast('Select a budget period date', 'error');
      return;
    }
    if (!resolvedName) {
      showToast('Please enter a budget name', 'error');
      return;
    }
    if (isDateCnBudgetName(resolvedName)) {
      showToast(DATE_CN_BUDGET_NAME_WARNING, 'warning');
    }
  }

  const duplicate = existing.find(b =>
    b.name.toLowerCase().trim() === resolvedName.toLowerCase() &&
    b.team_id === teamId &&
    !b.is_deleted
  );
  if (duplicate) {
    showToast('A budget with this name already exists in your team', 'error');
    return;
  }

  const categories = [];
  const rows = document.querySelectorAll('#budgetCategoriesContainer .category-row');
  const { currency: headerCurrency, rate: headerRate } = getCreateBudgetHeaderCurrency();

  if (!headerCurrency) {
    showToast('Select a budget currency', 'error');
    return;
  }
  if (!(headerRate > 0) && headerCurrency !== 'USD') {
    showToast('Enter a valid exchange rate', 'error');
    return;
  }

  const rate = headerCurrency === 'USD' ? 1 : headerRate;

  rows.forEach(row => {
    const catCategory = row.querySelector('.budget-cat-category')?.value?.trim()
      || row.querySelector('.budget-cat-name')?.value?.trim();
    const catSub = row.querySelector('.budget-cat-subcategory')?.value?.trim() || null;
    const usdRaw = parseFloat(row.querySelector('.budget-cat-usd')?.value);
    const usdAmount = Number.isFinite(usdRaw) ? usdRaw : 0;
    const localRaw = parseFloat(row.querySelector('.budget-cat-local')?.value);
    const localAmount = Number.isFinite(localRaw)
      ? localRaw
      : (headerCurrency === 'USD' ? usdAmount : usdAmount * rate);

    if (catCategory) {
      categories.push({
        category: catCategory,
        subcategory: catSub,
        name: formatCategoryLabel(catCategory, catSub),
        usdAmount,
        localAmount,
        currency: headerCurrency,
        rate
      });
    }
  });

  if (categories.length === 0) {
    showToast('Please add at least one category', 'error');
    return;
  }

  const totalAmount = categories.reduce((sum, c) => sum + c.usdAmount, 0);
  const status = BUDGET_STATUS.DRAFT;

  const budget = {
    team_id: teamId,
    name: resolvedName,
    status: status,
    approval_status: 'DRAFT',
    budget_type: budgetType,
    calendar_entry_id,
    budget_period_date,
    categories: categories,
    total_amount: totalAmount,
    spent_amount: 0,
    created_by: state.user?.id,
    is_deleted: false
  };

  showConfirm(`Are you sure you want to create the budget "${resolvedName}"?`, async () => {
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.textContent;
    btn.textContent = 'Creating...';
    btn.disabled = true;

    try {
      const result = await sbInsert('budget_plans', budget);
      if (result && !result.error) {
        showToast(`Budget "${resolvedName}" created successfully!`, 'success');
        const insertedBudget = result.data?.[0] || budget;
        document.getElementById('createBudgetForm').reset();
        await seedCreateBudgetCategoryRows();
        populateCreateBudgetCurrencySelect();
        populateCalendarSelect();
        await onBudgetTypeChange();
        const all = await localGetAll('budget_plans');
        state.budgetPlans = all.filter(b => b.team_id === teamId);
        window.showPage('view-budgets');
        if (launchWizardAfterCreate) {
          launchWizardAfterCreate = false;
          setTimeout(() => {
            window.submitBudgetApproval(insertedBudget.id);
          }, 100);
        }
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
  });
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
            <select id="budgetFilterStatus" onchange="window.onBudgetStatusFilterChange()">
              <option value="all" selected>All</option>
              <option value="approved">Approved</option>
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="rejected">Rejected</option>
              <option value="archived">Archived</option>
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
        <h2 id="editBudgetModalTitle">Edit Budget</h2>
        <form id="editBudgetForm" onsubmit="window.saveEditedBudget(); return false;">
          <input type="hidden" id="editBudgetId">
          <div class="form-stack">
            <div class="form-grid-row form-grid-row--budget-header">
              <div class="form-group budget-type-first">
                <label>Budget Type</label>
                <input type="text" id="editBudgetTypeDisplay" readonly>
                <input type="hidden" id="editBudgetType">
              </div>
              <div class="form-group" id="editMonthlyNameGroup">
                <label>Budget Name</label>
                <input type="text" id="editBudgetName" required onblur="window.validateEditBudgetName(this)">
                <p id="editBudgetNameHint" class="form-hint" style="display:none;">Monthly budgets use the org calendar label and cannot be renamed here.</p>
              </div>
            </div>

            <div class="form-grid-row form-grid-row--budget-b">
              <div class="form-group">
                <label>Status</label>
                <select id="editBudgetStatus" required></select>
              </div>
              <div class="form-group">
                <label>Currency</label>
                <select id="editBudgetCurrency" required onchange="window.onEditBudgetHeaderCurrencyChange()"><option value="">—</option></select>
              </div>
              <div class="form-group">
                <label>Exch Rate</label>
                <input type="number" class="input-rate" id="editBudgetRate" step="any" placeholder="Rate" required oninput="window.onEditBudgetHeaderRateChange()">
              </div>
            </div>
            <p class="form-hint" id="editBudgetRateNote">Enter local amounts; USD is calculated from the exchange rate above.</p>
          </div>

          <h3 style="margin-top: 25px;">Categories &amp; Amounts</h3>
          <div class="budget-line-table-wrap show-desktop">
            <div class="budget-line-table-head">
              <span>Category</span>
              <span>Local Amount</span>
              <span>USD Amount</span>
              <span></span>
            </div>
          </div>
          <div id="editBudgetCategoriesContainer" class="budget-line-cards"></div>

          <div class="budget-grand-total-card">
            ${cardRow('Total Local', '<span id="editBudgetTotalLocal">0.00</span>')}
            ${cardRow('Total USD', '<span id="editBudgetTotalUsd">0.00</span>')}
          </div>

          <div class="btn-group">
            <button type="button" class="secondary" id="addEditCatBtn" onclick="window.addEditCategoryRow()">+ Add Category</button>
            <button type="submit" class="success" id="saveEditBudgetBtn">Save Changes</button>
            <button type="button" class="success" id="saveEditBudgetSubmitBtn" onclick="window.saveEditedBudgetAndSubmit(event)">Save &amp; Submit</button>
            <button type="button" class="secondary" onclick="window.closeEditBudgetModal()">Cancel</button>
          </div>
        </form>
      </div>
    </div>

    <div id="submissionWizardModal" class="modal">
      <div class="modal-content" style="max-width: 700px; padding: 25px;">
        <button class="close-modal" onclick="window.closeWizardModal()">&times;</button>
        <h2 style="margin-bottom: 20px;">Budget Submission Wizard</h2>
        <div class="wizard-progress-bar" style="height: 6px; background: #eee; border-radius: 3px; margin-bottom: 25px; position: relative;">
          <div id="wizardProgressBarFill" style="height: 100%; width: 10%; background: #28a745; border-radius: 3px; transition: width 0.3s ease;"></div>
        </div>
        <div id="wizardStepTitle" style="font-weight: bold; font-size: 1.1rem; margin-bottom: 15px; color: #333;">Step 1 of 10</div>
        <div id="wizardStepsContainer" class="form-stack"></div>
        <div class="wizard-footer" style="margin-top: 30px; display: flex; justify-content: space-between; align-items: center;">
          <button type="button" class="secondary" id="wizardPrevBtn" onclick="window.wizardPrevStep()">Back</button>
          <button type="button" class="success" id="wizardNextBtn" onclick="window.wizardNextStep()">Next</button>
        </div>
      </div>
    </div>
  `;
}

export async function initViewBudgetsPage() {
  window.submitBudgetApproval = submitBudgetApprovalHandler;
  window.onBudgetStatusFilterChange = onBudgetStatusFilterChange;
  window.backToBudgetList = backToBudgetList;
  window.markBudgetReceived = markBudgetReceived;

  const container = document.getElementById('budgetsContainer');
  if (!container) {
    setTimeout(() => window.initViewBudgetsPage(), 50);
    return;
  }

  const statusFilterEl = document.getElementById('budgetFilterStatus');
  const nameFilterEl = document.getElementById('budgetFilterName');
  const statusFilter = statusFilterEl ? statusFilterEl.value : 'all';
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
    budgets = budgets.filter(b => getBudgetStatus(b) === statusFilter);
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

function onBudgetStatusFilterChange() {
  const nameFilter = document.getElementById('budgetFilterName');
  if (nameFilter) nameFilter.value = '';
  initViewBudgetsPage();
}

function backToBudgetList() {
  const nameFilter = document.getElementById('budgetFilterName');
  if (nameFilter) nameFilter.value = '';
  initViewBudgetsPage();
}

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
    const statusBadge = budgetStatusBadgeHtml(budget);

    const canSubmitApproval = canSubmitBudgetApproval() && canSubmitBudgetByStatus(budget);
    const submitBtn = canSubmitApproval
      ? `<button type="button" class="small success" onclick="event.stopPropagation(); window.submitBudgetApproval('${budget.id}')">Submit for approval</button>`
      : '';

    const isTeamLead = state.userTeamAccess?.access_level === 'lead' || state.userTeamAccess?.access_level === 'admin' || state.user?.role === 'admin';
    const status = getBudgetStatus(budget);
    const showMarkReceived = isTeamLead && status === BUDGET_STATUS.PAID;
    const receivedBtn = showMarkReceived
      ? `<button type="button" class="small success" onclick="event.stopPropagation(); window.markBudgetReceived('${budget.id}')">Received</button>`
      : '';

    let healthBadge = '';
    if (isOver) healthBadge = '<span class="badge badge-danger">Over Budget</span>';
    else if (totalBudgetedUSD > 0 && totalSpentUSD / totalBudgetedUSD > 0.9) healthBadge = '<span class="badge badge-warning">Near Limit</span>';
    else healthBadge = '<span class="badge badge-success">On Track</span>';

    grandTotalBudgeted += totalBudgetedUSD;
    grandTotalSpent += totalSpentUSD;

    const canEdit = canOpenBudgetEditor(budget);
    const canDelete = state.canDeleteBudgets;

    const typeBadge = `<span class="badge badge-secondary">${getBudgetTypeLabel(budget.budget_type)}</span>`;

    tableRows += `
      <tr style="cursor: pointer;" onclick="window.viewBudgetDetail('${budget.id}')">
        <td data-label="Budget"><strong>${budget.name}</strong><br><span style="font-size:0.8em;">${typeBadge}</span></td>
        <td data-label="Status">${statusBadge}</td>
        <td data-label="Budgeted">$${totalBudgetedUSD.toFixed(2)}</td>
        <td data-label="Spent">$${totalSpentUSD.toFixed(2)}</td>
        <td data-label="Remaining" class="${isOver ? 'negative' : 'positive'}" style="font-weight: bold;">$${remaining.toFixed(2)}</td>
        <td data-label="Health">${healthBadge}</td>
        <td data-label="Actions" class="action-buttons">
          ${submitBtn}
          ${receivedBtn}
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
            ${submitBtn}
            ${receivedBtn}
            ${canEdit ? btnIconEdit(`window.editBudgetPlan('${budget.id}')`) : ''}
            ${canDelete ? btnIconDelete(`window.deleteBudgetPlan('${budget.id}')`) : ''}
          </span>
        </div>
        ${cardRow('Type', typeBadge)}
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

/**
 * Shared budget detail markup (View Budgets + Approval review modal).
 * @param {object} budget
 * @param {{ showActions?: boolean }} [options]
 */
export function renderBudgetReviewHtml(budget, options = {}) {
  const showActions = options.showActions !== false;
  const isApprovalMode = options.isApprovalMode === true;
  let totalBudgetedUSD = 0;
  let totalSpentUSD = 0;
  let tableRows = '';
  let mobileCards = '';
  const statusBadge = budgetStatusBadgeHtml(budget);

  const canSubmitApproval = showActions && canSubmitBudgetApproval() && canSubmitBudgetByStatus(budget);
  const submitBtn = canSubmitApproval
    ? `<button type="button" class="small success" onclick="event.stopPropagation(); window.submitBudgetApproval('${budget.id}')">Submit for approval</button>`
    : '';

  const isTeamLead = state.userTeamAccess?.access_level === 'lead' || state.userTeamAccess?.access_level === 'admin' || state.user?.role === 'admin';
  const status = getBudgetStatus(budget);
  const showMarkReceived = isTeamLead && status === BUDGET_STATUS.PAID;
  const receivedBtn = showMarkReceived
    ? `<button type="button" class="small success" onclick="event.stopPropagation(); window.markBudgetReceived('${budget.id}')">Received</button>`
    : '';

  (budget.categories || []).forEach(cat => {
    const budgetedUSD = cat.usdAmount || cat.usd_amount || 0;
    totalBudgetedUSD += budgetedUSD;
    const spentUSD = 0;
    totalSpentUSD += spentUSD;
    const remainingUSD = budgetedUSD - spentUSD;
    const percent = budgetedUSD > 0 ? (remainingUSD / budgetedUSD * 100) : 0;
    const localAmtVal = cat.localAmount || cat.local_amount || 0;
    const localDisplay = localAmtVal
      ? `${Number(localAmtVal).toLocaleString()} ${cat.currency || ''}`
      : '—';

    if (isApprovalMode) {
      tableRows += `
        <tr>
          <td data-label="Category"><strong>${cat.name || ''}</strong></td>
          <td data-label="Local">${localDisplay}</td>
          <td data-label="Budgeted">$${budgetedUSD.toFixed(2)}</td>
        </tr>
      `;

      mobileCards += `
        <article class="data-card data-card--compact">
          <div class="data-card-top">
            <span class="data-card-title">${cat.name || ''}</span>
          </div>
          ${cardRow('Local', localDisplay)}
          ${cardRow('Budgeted', `$${budgetedUSD.toFixed(2)}`)}
        </article>
      `;
    } else {
      tableRows += `
        <tr>
          <td data-label="Category"><strong>${cat.name || ''}</strong></td>
          <td data-label="Local">${localDisplay}</td>
          <td data-label="Budgeted">$${budgetedUSD.toFixed(2)}</td>
          <td data-label="Spent">$${spentUSD.toFixed(2)}</td>
          <td data-label="Remaining">$${remainingUSD.toFixed(2)} (${percent.toFixed(1)}%)</td>
        </tr>
      `;

      mobileCards += `
        <article class="data-card data-card--compact">
          <div class="data-card-top">
            <span class="data-card-title">${cat.name || ''}</span>
          </div>
          ${cardRow('Local', localDisplay)}
          ${cardRow('Budgeted', `$${budgetedUSD.toFixed(2)}`)}
          ${cardRow('Spent', `$${spentUSD.toFixed(2)}`)}
          ${cardRow('Remaining', `$${remainingUSD.toFixed(2)} (${percent.toFixed(1)}%)`)}
        </article>
      `;
    }
  });

  const totalRemaining = totalBudgetedUSD - totalSpentUSD;
  const totalPercent = totalBudgetedUSD > 0 ? (totalSpentUSD / totalBudgetedUSD * 100) : 0;
  const isOverBudget = totalRemaining < 0;
  const canEdit = showActions && canOpenBudgetEditor(budget);
  const canDelete = showActions && state.canDeleteBudgets;
  const typeLabel = getBudgetTypeLabel(budget.budget_type);

  if (isApprovalMode) {
    return `
      <div class="budget-plan-card">
        <h4 style="margin: 0 0 15px;">Category Breakdown</h4>
        <div class="table-container show-desktop">
          <table class="table-stack-mobile">
            <thead>
              <tr>
                <th>Category</th>
                <th>Local</th>
                <th>Budgeted (USD)</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows || '<tr><td colspan="3">No categories</td></tr>'}
            </tbody>
            <tfoot>
              <tr style="font-weight: bold; border-top: 2px solid var(--border);">
                <td>Total Budgeted</td>
                <td>—</td>
                <td>$${totalBudgetedUSD.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div class="show-mobile data-card-list">
          ${mobileCards || '<p class="empty-state">No categories</p>'}
          <div style="margin-top: 15px; font-weight: bold; font-size: 1.1em; text-align: right; padding-right: 10px;">
            Total Budgeted: $${totalBudgetedUSD.toFixed(2)}
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="budget-plan-card">
      <h3>
        <span>${budget.name} ${statusBadge} <span class="badge badge-secondary">${typeLabel}</span></span>
        ${showActions ? `<span class="action-icon-group">
          ${submitBtn ? `<button type="button" class="small success" onclick="event.stopPropagation(); window.submitBudgetApproval('${budget.id}')">Submit</button>` : ''}
          ${receivedBtn ? `<button type="button" class="small success" onclick="event.stopPropagation(); window.markBudgetReceived('${budget.id}')">Received</button>` : ''}
          ${canEdit ? btnIconEdit(`window.editBudgetPlan('${budget.id}')`) : ''}
          ${canDelete ? btnIconDelete(`window.deleteBudgetPlan('${budget.id}')`) : ''}
        </span>` : ''}
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
      <div class="table-container show-desktop">
        <table class="table-stack-mobile">
          <thead>
            <tr>
              <th>Category</th>
              <th>Local</th>
              <th>Budgeted (USD)</th>
              <th>Spent (USD)</th>
              <th>Remaining</th>
            </tr>
          </thead>
          <tbody>${tableRows || '<tr><td colspan="5">No categories</td></tr>'}</tbody>
        </table>
      </div>
      <div class="show-mobile data-card-list">${mobileCards || '<p class="empty-state">No categories</p>'}</div>
    </div>
  `;
}

function renderBudgetDetailCards(container, budgets) {
  const backBtn = `<div style="margin-bottom: 20px;"><button type="button" class="secondary" onclick="window.backToBudgetList()">← Back to List</button></div>`;
  container.innerHTML = backBtn + (budgets || []).map(b => renderBudgetReviewHtml(b, { showActions: true })).join('');
}

let wizardBudget = null;
let wizardStep = 1;
let wizardData = {};
let wizardOpenBudgets = [];
let wizardBuckets = [];

const WIZARD_STEPS = [
  { step: 1, title: 'Step 1: Open Budgets Review', id: 'step-open-budgets' },
  { step: 2, title: 'Step 2: Close Previous Month Expenses', id: 'step-close-expenses' },
  { step: 3, title: 'Step 3: Bank & Cash Reconciliation', id: 'step-reconciliation' },
  { step: 4, title: 'Step 4: Team Information', id: 'step-team-info' },
  { step: 5, title: 'Step 5: Housing Information', id: 'step-housing-info' },
  { step: 6, title: 'Step 6: Accomplishments', id: 'step-accomplishments' },
  { step: 7, title: 'Step 7: Income Report', id: 'step-income-report' },
  { step: 8, title: 'Step 8: Social Media Tracking', id: 'step-social-media' },
  { step: 9, title: 'Step 9: Coursing / Outreach Tracking', id: 'step-coursing' },
  { step: 10, title: 'Step 10: Final Review & Submit', id: 'step-final-submit' }
];

window.closeWizardModal = function() {
  document.getElementById('submissionWizardModal').classList.remove('active');
  wizardBudget = null;
  wizardStep = 1;
  wizardData = {};
  wizardOpenBudgets = [];
  wizardBuckets = [];
};

window.wizardPrevStep = function() {
  if (wizardStep > 1) {
    wizardStep--;
    window.renderWizardStep();
  }
};

window.wizardNextStep = async function() {
  const container = document.getElementById('wizardStepsContainer');
  let updatePayload = {};

  if (wizardStep === 1) {
    const explanations = [];
    let valid = true;
    wizardOpenBudgets.forEach((ob, idx) => {
      const reason = document.getElementById(`ob-reason-${idx}`)?.value?.trim();
      const status = document.getElementById(`ob-status-${idx}`)?.value?.trim();
      const closure = document.getElementById(`ob-closure-${idx}`)?.value?.trim();
      if (!reason || !status || !closure) {
        valid = false;
        return;
      }
      explanations.push({ budgetId: ob.id, name: ob.name, reason, status, closure });
    });
    if (!valid && wizardOpenBudgets.length > 0) {
      showToast('Please complete all open budget explanation fields', 'warning');
      return;
    }
    wizardData.openBudgetsExplanation = explanations;
    updatePayload.open_budgets_explanation = explanations;
  } else if (wizardStep === 2) {
    const confirmChk = document.getElementById('confirmExpensesClosed')?.checked;
    if (!confirmChk) {
      showToast('You must confirm previous month expenses are frozen', 'warning');
      return;
    }
    wizardData.expensesClosed = true;
  } else if (wizardStep === 3) {
    const confirmChk = document.getElementById('confirmReconciliation')?.checked;
    if (!confirmChk) {
      showToast('You must confirm the reconciliation details are correct', 'warning');
      return;
    }
    const total = wizardBuckets.reduce((sum, b) => sum + (b.balance || 0), 0);
    wizardData.cashBalance = 0;
    wizardData.bankBalance = total;
    wizardData.remainingFunds = total;
    wizardData.reconciliationConfirmed = true;

    updatePayload.recon_cash_balance = 0;
    updatePayload.recon_bank_balance = total;
    updatePayload.recon_remaining_funds = total;
  } else if (wizardStep === 4) {
    const info = document.getElementById('wizardTeamInfo')?.value?.trim();
    if (!info) {
      showToast('Team information is required', 'warning');
      return;
    }
    wizardData.teamInfo = info;
    updatePayload.submission_team_info = { text: info };
  } else if (wizardStep === 5) {
    const info = document.getElementById('wizardHousingInfo')?.value?.trim();
    if (!info) {
      showToast('Housing information is required', 'warning');
      return;
    }
    wizardData.housingInfo = info;
    updatePayload.submission_housing_info = { text: info };
  } else if (wizardStep === 6) {
    const info = document.getElementById('wizardAccomplishments')?.value?.trim();
    if (!info) {
      showToast('Accomplishments are required', 'warning');
      return;
    }
    wizardData.accomplishments = info;
    updatePayload.submission_accomplishments = { text: info };
  } else if (wizardStep === 7) {
    const info = document.getElementById('wizardIncomeReport')?.value?.trim();
    if (!info) {
      showToast('Income report is required', 'warning');
      return;
    }
    wizardData.incomeReport = info;
    updatePayload.submission_income_report = { text: info };
  } else if (wizardStep === 8) {
    const handles = document.getElementById('wizardSocialHandles')?.value?.trim();
    const yoga = parseInt(document.getElementById('wizardSocialYoga')?.value, 10);
    const other = parseInt(document.getElementById('wizardSocialOther')?.value, 10);
    if (Number.isNaN(yoga) || Number.isNaN(other)) {
      showToast('Yoga and other post counts are required', 'warning');
      return;
    }
    const sm = { handles, yoga, other };
    wizardData.socialMedia = sm;
    updatePayload.submission_social_media = sm;
  } else if (wizardStep === 9) {
    const adheenavasis = parseInt(document.getElementById('wizardCoursingAdheenavasis')?.value, 10);
    const pss = parseInt(document.getElementById('wizardCoursingPss')?.value, 10);
    const sjp = parseInt(document.getElementById('wizardCoursingSjp')?.value, 10);
    const business = parseInt(document.getElementById('wizardCoursingBusiness')?.value, 10);
    if (Number.isNaN(adheenavasis) || Number.isNaN(pss) || Number.isNaN(sjp) || Number.isNaN(business)) {
      showToast('All coursing counts are required', 'warning');
      return;
    }
    const crs = { adheenavasis, pss, sjp, business };
    wizardData.coursing = crs;
    updatePayload.submission_coursing = crs;
  } else if (wizardStep === 10) {
    const btn = document.getElementById('wizardNextBtn');
    btn.textContent = 'Submitting...';
    btn.disabled = true;
    try {
      const { error: updateErr } = await supabaseClient
        .from('budget_plans')
        .update({
          open_budgets_explanation: wizardData.openBudgetsExplanation,
          recon_cash_balance: wizardData.cashBalance,
          recon_bank_balance: wizardData.bankBalance,
          recon_remaining_funds: wizardData.remainingFunds,
          submission_team_info: { text: wizardData.teamInfo },
          submission_housing_info: { text: wizardData.housingInfo },
          submission_accomplishments: { text: wizardData.accomplishments },
          submission_income_report: { text: wizardData.incomeReport },
          submission_social_media: wizardData.socialMedia,
          submission_coursing: wizardData.coursing
        })
        .eq('id', wizardBudget.id);

      if (updateErr) throw updateErr;

      // Freeze all currently logged unfrozen expenses for this team
      const { error: freezeErr } = await supabaseClient
        .from('expenses')
        .update({ is_frozen: true })
        .eq('team_id', wizardBudget.team_id)
        .eq('is_frozen', false);

      if (freezeErr) console.warn('Non-blocking expenses freeze warning:', freezeErr);

      const request = await submitBudgetForApproval(wizardBudget);
      showToast(`Submitted as ${request.request_number}`, 'success');
      window.closeWizardModal();
      await initViewBudgetsPage();
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Submission failed', 'error');
      btn.textContent = 'Submit';
      btn.disabled = false;
    }
    return;
  }

  // Autosave intermediate step data to database
  if (Object.keys(updatePayload).length > 0) {
    try {
      await supabaseClient
        .from('budget_plans')
        .update(updatePayload)
        .eq('id', wizardBudget.id);
    } catch (err) {
      console.warn('Autosave failed:', err);
    }
  }

  wizardStep++;
  window.renderWizardStep();
};

window.renderWizardStep = function() {
  const container = document.getElementById('wizardStepsContainer');
  const fill = document.getElementById('wizardProgressBarFill');
  const title = document.getElementById('wizardStepTitle');
  const prevBtn = document.getElementById('wizardPrevBtn');
  const nextBtn = document.getElementById('wizardNextBtn');

  if (!container || !fill || !title) return;

  const currentConfig = WIZARD_STEPS.find(s => s.step === wizardStep);
  title.textContent = `${currentConfig.title}`;
  fill.style.width = `${(wizardStep / 10) * 100}%`;
  prevBtn.style.display = wizardStep === 1 ? 'none' : 'inline-block';
  nextBtn.textContent = wizardStep === 10 ? 'Submit' : 'Next';

  const todayStr = new Date().toISOString().split('T')[0];

  let html = '';
  if (wizardStep === 1) {
    if (!wizardOpenBudgets.length) {
      html = `
        <div class="card" style="padding: 15px; border: 1px solid #ddd; border-radius: 8px;">
          <p style="color: #28a745; font-weight: bold; margin: 0;">✓ All previous budgets are closed or received. No explanation required.</p>
        </div>
      `;
    } else {
      html = `
        <p class="section-hint" style="margin-bottom: 15px;">The following budgets are still open. Please explain their current status:</p>
        ${wizardOpenBudgets.map((ob, idx) => {
          const draftVal = wizardData.openBudgetsExplanation?.find(x => x.budgetId === ob.id) || {};
          return `
            <div class="card" style="padding: 15px; margin-bottom: 15px; border: 1px solid #ffc107; border-radius: 8px; background: #fffdf5;">
              <h4 style="margin: 0 0 10px 0; color: #856404;">Budget: ${escapeHtmlAttr(ob.name)} (${ob.status})</h4>
              <div class="form-group" style="margin-bottom: 10px;">
                <label>Reason Still Open *</label>
                <textarea id="ob-reason-${idx}" placeholder="Enter reason" required style="width: 100%; min-height: 60px;">${escapeHtmlAttr(draftVal.reason || '')}</textarea>
              </div>
              <div class="form-grid-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <div class="form-group">
                  <label>Current Status *</label>
                  <input type="text" id="ob-status-${idx}" placeholder="e.g. Pending receipts" value="${escapeHtmlAttr(draftVal.status || '')}" required style="width: 100%;">
                </div>
                <div class="form-group">
                  <label>Expected Closure *</label>
                  <input type="date" id="ob-closure-${idx}" value="${draftVal.closure || todayStr}" required style="width: 100%;">
                </div>
              </div>
            </div>
          `;
        }).join('')}
      `;
    }
  } else if (wizardStep === 2) {
    html = `
      <div class="card" style="padding: 20px; text-align: center; border-radius: 8px; border: 1px solid #ddd;">
        <p style="font-size: 1.1rem; margin-bottom: 20px; color: #555;">Please verify and confirm all receipts and expense amounts entered against your budgets up to this moment. Upon final submission at the end of this wizard, these records will be locked and frozen for Finance review.</p>
        <label style="display: inline-flex; align-items: center; gap: 10px; font-weight: bold; cursor: pointer;">
          <input type="checkbox" id="confirmExpensesClosed" style="transform: scale(1.3);" ${wizardData.expensesClosed ? 'checked' : ''}>
          I confirm that all previous month expenses and receipts are finalized
        </label>
      </div>
    `;
  } else if (wizardStep === 3) {
    const totalBalance = wizardBuckets.reduce((sum, b) => sum + (b.balance || 0), 0);
    html = `
      <div class="card" style="padding: 15px; border-radius: 8px; border: 1px solid #ddd;">
        <h4 style="margin-top: 0; margin-bottom: 15px;">Bank &amp; Cash Reconciliation</h4>
        <p class="section-hint" style="margin-bottom: 15px;">Below is the current balance of all active buckets associated with this budget Proposal:</p>
        <div style="margin-bottom: 15px; border: 1px solid #eee; padding: 10px; border-radius: 6px; background: #fafafa;">
          ${wizardBuckets.map(b => `
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #eee; padding: 6px 0;">
              <span>${escapeHtmlAttr(b.name)} (${escapeHtmlAttr(b.currency || 'USD')})</span>
              <span style="font-weight: bold;">$${Number(b.balance || 0).toFixed(2)}</span>
            </div>
          `).join('')}
          <div style="display: flex; justify-content: space-between; border-top: 2px solid #ccc; padding-top: 10px; margin-top: 10px; font-weight: bold; font-size: 1.1rem; color: #28a745;">
            <span>Total Balance</span>
            <span>$${totalBalance.toFixed(2)}</span>
          </div>
        </div>
        <label style="display: inline-flex; align-items: center; gap: 10px; font-weight: bold; cursor: pointer; margin-top: 10px;">
          <input type="checkbox" id="confirmReconciliation" style="transform: scale(1.3);" ${wizardData.reconciliationConfirmed ? 'checked' : ''}>
          I confirm the reconciliation details are correct
        </label>
      </div>
    `;
  } else if (wizardStep === 4) {
    html = `
      <div class="card" style="padding: 15px; border-radius: 8px; border: 1px solid #ddd;">
        <label>Team Members &amp; Assignments in this Period *</label>
        <textarea id="wizardTeamInfo" placeholder="List active team members and their assignments" style="width: 100%; min-height: 120px;" required>${escapeHtmlAttr(wizardData.teamInfo ?? '')}</textarea>
      </div>
    `;
  } else if (wizardStep === 5) {
    html = `
      <div class="card" style="padding: 15px; border-radius: 8px; border: 1px solid #ddd;">
        <label>Housing Details &amp; Cost Responsibility *</label>
        <textarea id="wizardHousingInfo" placeholder="Specify addresses, occupants, leaseholders, and rent / utility responsibilities" style="width: 100%; min-height: 120px;" required>${escapeHtmlAttr(wizardData.housingInfo ?? '')}</textarea>
      </div>
    `;
  } else if (wizardStep === 6) {
    html = `
      <div class="card" style="padding: 15px; border-radius: 8px; border: 1px solid #ddd;">
        <label>Accomplishments &amp; Goals Met *</label>
        <textarea id="wizardAccomplishments" placeholder="List goals achieved, completed tasks, and outcomes from the previous period" style="width: 100%; min-height: 120px;" required>${escapeHtmlAttr(wizardData.accomplishments ?? '')}</textarea>
      </div>
    `;
  } else if (wizardStep === 7) {
    html = `
      <div class="card" style="padding: 15px; border-radius: 8px; border: 1px solid #ddd;">
        <label>Income Generated *</label>
        <textarea id="wizardIncomeReport" placeholder="Details of Seva, Business, and Donation contributions received" style="width: 100%; min-height: 120px;" required>${escapeHtmlAttr(wizardData.incomeReport ?? '')}</textarea>
      </div>
    `;
  } else if (wizardStep === 8) {
    html = `
      <div class="card" style="padding: 15px; border-radius: 8px; border: 1px solid #ddd;">
        <h4 style="margin-top:0;">Social Media Tracking</h4>
        <div class="form-group" style="margin-bottom: 15px;">
          <label>Social Media Handles (URLs or Names)</label>
          <input type="text" id="wizardSocialHandles" value="${escapeHtmlAttr(wizardData.socialMedia?.handles ?? '')}" placeholder="YouTube, Facebook, etc." style="width: 100%;">
        </div>
        <div class="form-group" style="margin-bottom: 15px;">
          <label>Yoga Videos/Posts Created *</label>
          <input type="number" min="0" id="wizardSocialYoga" value="${wizardData.socialMedia?.yoga ?? 0}" required style="width: 100%;">
        </div>
        <div class="form-group" style="margin-bottom: 5px;">
          <label>Other Content/Posts *</label>
          <input type="number" min="0" id="wizardSocialOther" value="${wizardData.socialMedia?.other ?? 0}" required style="width: 100%;">
        </div>
      </div>
    `;
  } else if (wizardStep === 9) {
    html = `
      <div class="card" style="padding: 15px; border-radius: 8px; border: 1px solid #ddd;">
        <h4 style="margin-top:0;">Coursing / Outreach Tracking</h4>
        <div class="form-group" style="margin-bottom: 15px;">
          <label>Adheenavasis Contacted *</label>
          <input type="number" min="0" id="wizardCoursingAdheenavasis" value="${wizardData.coursing?.adheenavasis ?? 0}" required style="width: 100%;">
        </div>
        <div class="form-group" style="margin-bottom: 15px;">
          <label>PSS Contacts *</label>
          <input type="number" min="0" id="wizardCoursingPss" value="${wizardData.coursing?.pss ?? 0}" required style="width: 100%;">
        </div>
        <div class="form-group" style="margin-bottom: 15px;">
          <label>SJP Contacts *</label>
          <input type="number" min="0" id="wizardCoursingSjp" value="${wizardData.coursing?.sjp ?? 0}" required style="width: 100%;">
        </div>
        <div class="form-group" style="margin-bottom: 5px;">
          <label>Business Contacts *</label>
          <input type="number" min="0" id="wizardCoursingBusiness" value="${wizardData.coursing?.business ?? 0}" required style="width: 100%;">
        </div>
      </div>
    `;
  } else if (wizardStep === 10) {
    html = `
      <div class="card" style="padding: 15px; border-radius: 8px; border: 1px solid #ddd; max-height: 380px; overflow-y: auto;">
        <h4 style="margin-top: 0; border-bottom: 1px solid #eee; padding-bottom: 8px;">Submission Summary</h4>
        <p><strong>Budget Name:</strong> ${escapeHtmlAttr(wizardBudget.name)}</p>
        <p><strong>Explanations Filed:</strong> ${wizardData.openBudgetsExplanation?.length || 0}</p>
        <p><strong>Bank/Cash Total Balance:</strong> $${wizardData.bankBalance}</p>
        <p><strong>Team Info:</strong> ${escapeHtmlAttr(wizardData.teamInfo)}</p>
        <p><strong>Housing Info:</strong> ${escapeHtmlAttr(wizardData.housingInfo)}</p>
        <p><strong>Accomplishments:</strong> ${escapeHtmlAttr(wizardData.accomplishments)}</p>
        <p><strong>Income Report:</strong> ${escapeHtmlAttr(wizardData.incomeReport)}</p>
        <p><strong>Social Media:</strong> Yoga: ${wizardData.socialMedia?.yoga}, Other: ${wizardData.socialMedia?.other}</p>
        <p><strong>Coursing:</strong> Adheenavasis: ${wizardData.coursing?.adheenavasis}, PSS: ${wizardData.coursing?.pss}, SJP: ${wizardData.coursing?.sjp}, Business: ${wizardData.coursing?.business}</p>
      </div>
      <p style="color: #666; font-size: 0.9rem; margin-top: 15px;">Please confirm all details are correct. Clicking Submit will record your accountability statistics and route this budget plan for approval.</p>
    `;
  }

  container.innerHTML = html;
};

async function submitBudgetApprovalHandler(budgetId) {
  const budget = (state.budgetPlans || []).find(b => b.id === budgetId);
  if (!budget) {
    showToast('Budget not found', 'error');
    return;
  }
  if (!canSubmitBudgetApproval()) {
    showToast('Only OPL can submit budgets for approval', 'warning');
    return;
  }
  if (!canSubmitBudgetByStatus(budget)) {
    showToast('Only draft or rejected budgets can be submitted', 'warning');
    return;
  }
  if (!state.user?.request_alias) {
    showToast('Set your request alias in My Profile first', 'warning');
    window.showPage?.('profile');
    return;
  }

  try {
    const teamId = budget.team_id;
    const [{ data: openBudgets }, { data: buckets }] = await Promise.all([
      supabaseClient
        .from('budget_plans')
        .select('id, name, status')
        .eq('team_id', teamId)
        .eq('is_deleted', false)
        .neq('id', budget.id)
        .in('status', ['approved', 'received']),
      supabaseClient
        .from('buckets')
        .select('id, name, balance, currency')
        .eq('team_id', teamId)
        .eq('is_deleted', false)
    ]);

    wizardBudget = budget;
    wizardStep = 1;
    wizardData = {
      openBudgetsExplanation: budget.open_budgets_explanation || [],
      cashBalance: budget.recon_cash_balance || 0,
      bankBalance: budget.recon_bank_balance || 0,
      remainingFunds: budget.recon_remaining_funds || 0,
      teamInfo: budget.submission_team_info?.text || '',
      housingInfo: budget.submission_housing_info?.text || '',
      accomplishments: budget.submission_accomplishments?.text || '',
      incomeReport: budget.submission_income_report?.text || '',
      socialMedia: budget.submission_social_media || {},
      coursing: budget.submission_coursing || {},
      expensesClosed: false,
      reconciliationConfirmed: (budget.recon_bank_balance > 0)
    };
    wizardOpenBudgets = openBudgets || [];
    wizardBuckets = buckets || [];

    document.getElementById('submissionWizardModal').classList.add('active');
    window.renderWizardStep();
  } catch (err) {
    console.error('Wizard open error:', err);
    showToast('Could not initialize submission wizard', 'error');
  }
}

async function markBudgetReceived(budgetId) {
  const budget = (state.budgetPlans || []).find(b => b.id === budgetId);
  if (!budget) {
    showToast('Budget not found', 'error');
    return;
  }
  const isTeamLead = state.userTeamAccess?.access_level === 'lead' || state.userTeamAccess?.access_level === 'admin' || state.user?.role === 'admin';
  if (!isTeamLead) {
    showToast('Only team lead can receive budgets', 'warning');
    return;
  }

  const ok = await new Promise(resolve => {
    showConfirm('Mark funds as received in your buckets?', () => resolve(true), () => resolve(false));
  });
  if (!ok) return;

  try {
    const { error } = await supabaseClient
      .from('budget_plans')
      .update({ status: 'received' })
      .eq('id', budgetId);

    if (error) throw error;
    showToast('Budget marked as RECEIVED. Team can now record expenses!', 'success');
    await initViewBudgetsPage();
  } catch (err) {
    showToast(err.message || 'Action failed', 'error');
  }
}

window.viewBudgetDetail = function(budgetId) {
  const statusFilter = document.getElementById('budgetFilterStatus');
  const nameFilter = document.getElementById('budgetFilterName');
  if (statusFilter) statusFilter.value = 'all';
  if (nameFilter) nameFilter.value = budgetId;
  initViewBudgetsPage();
};

function populateEditBudgetCurrencySelect(selected) {
  const select = document.getElementById('editBudgetCurrency');
  if (!select) return;
  const currencies = getLocalCurrenciesFromRates(state.exchangeRates || []);
  select.innerHTML = '<option value="">—</option>';
  currencies.forEach(c => {
    select.innerHTML += `<option value="${c}">${c}</option>`;
  });
  select.innerHTML += '<option value="USD">USD</option>';
  if (selected) select.value = selected;
}

window.onEditBudgetHeaderCurrencyChange = function() {
  const currency = document.getElementById('editBudgetCurrency')?.value;
  const rateInput = document.getElementById('editBudgetRate');
  if (!currency || !rateInput) return;
  if (currency === 'USD') {
    rateInput.value = '1';
  } else {
    const rate = getLatestUsdRate(state.exchangeRates || [], currency);
    rateInput.value = rate !== null ? rateForInput(rate) : '';
  }
  updateBudgetLineAmountHint();
  recalculateAllBudgetUsdFromLocal('#editBudgetCategoriesContainer', getEditBudgetHeaderCurrency);
};

window.onEditBudgetHeaderRateChange = function() {
  recalculateAllBudgetUsdFromLocal('#editBudgetCategoriesContainer', getEditBudgetHeaderCurrency);
};

window.editBudgetPlan = async function(id) {
  const allBudgets = state.budgetPlans || state._budgets || [];
  const budget = normalizeBudgetPlan(allBudgets.find(b => b.id === id));
  if (!budget) {
    showToast('Budget not found', 'error');
    return;
  }

  if (!canOpenBudgetEditor(budget) && !isSystemAdmin()) {
    showToast('You do not have permission to edit budgets', 'error');
    return;
  }

  budgetFormMode = 'edit';
  await ensureExchangeRatesLoaded();
  await ensureEditTemplateRowKeys();

  const linesEditable = canEditBudgetLines(budget);
  const status = getBudgetStatus(budget);

  document.getElementById('editBudgetId').value = budget.id;
  const budgetType = budget.budget_type || 'adhoc';
  document.getElementById('editBudgetType').value = budgetType;
  document.getElementById('editBudgetTypeDisplay').value = getBudgetTypeLabel(budgetType);
  document.getElementById('editBudgetName').value = budget.name;
  applyEditBudgetNameState(budgetType);

  const statusSelect = document.getElementById('editBudgetStatus');
  statusSelect.innerHTML = budgetStatusOptionsHtml(status, {
    allowArchive: canArchiveBudget(budget) || status === BUDGET_STATUS.ARCHIVED
  });

  const firstCat = (budget.categories || [])[0] || {};
  const headerCurrency = firstCat.currency || '';
  const headerRate = firstCat.rate || (headerCurrency === 'USD' ? 1 : '');
  populateEditBudgetCurrencySelect(headerCurrency);
  const rateEl = document.getElementById('editBudgetRate');
  if (rateEl) rateEl.value = headerRate !== '' && headerRate != null ? rateForInput(headerRate) : '';

  const container = document.getElementById('editBudgetCategoriesContainer');
  container.innerHTML = '';

  const cats = (budget.categories || []).map(normalizeBudgetCategory);
  cats.forEach(cat => {
    window.addEditCategoryRow(cat, { deferLock: true });
  });

  recalculateAllBudgetUsdFromLocal('#editBudgetCategoriesContainer', getEditBudgetHeaderCurrency);

  const note = document.getElementById('editBudgetRateNote');
  const addBtn = document.getElementById('addEditCatBtn');
  const saveBtn = document.getElementById('saveEditBudgetBtn');

  setEditBudgetFormLocked(!linesEditable, budget);

  if (note) {
    if (linesEditable) {
      note.style.color = '#666';
      updateBudgetLineAmountHint();
    } else {
      note.textContent = isSystemAdmin()
        ? 'SYS override: you can edit this budget.'
        : '⚠️ This budget is locked. Only SYS can edit amounts. Team lead may archive an approved budget.';
      note.style.color = '#856404';
    }
  }

  if (addBtn) addBtn.style.display = linesEditable ? 'inline-block' : 'none';
  if (saveBtn) {
    saveBtn.textContent = 'Save Changes';
    saveBtn.disabled = false;
    saveBtn.style.display = (linesEditable || canArchiveBudget(budget) || isSystemAdmin()) ? '' : 'none';
  }

  document.getElementById('editBudgetModal').classList.add('active');
};

function setEditBudgetFormLocked(locked, budget) {
  const linesEditable = !locked;
  const nameInput = document.getElementById('editBudgetName');
  const currencyEl = document.getElementById('editBudgetCurrency');
  const rateEl = document.getElementById('editBudgetRate');
  const statusEl = document.getElementById('editBudgetStatus');

  if (nameInput && isMonthlyBudgetType(budget?.budget_type)) {
    nameInput.readOnly = true;
  } else if (nameInput) {
    nameInput.readOnly = !linesEditable;
  }

  if (currencyEl) currencyEl.disabled = !linesEditable;
  if (rateEl) rateEl.readOnly = !linesEditable;

  if (statusEl) {
    const canArchive = canArchiveBudget(budget);
    statusEl.disabled = !(linesEditable || canArchive || isSystemAdmin());
  }

  document.querySelectorAll('#editBudgetCategoriesContainer .category-row').forEach(row => {
    const localEl = row.querySelector('.budget-cat-local');
    const nameEl = row.querySelector('.budget-cat-name');
    if (localEl) localEl.readOnly = !linesEditable;
    if (nameEl) nameEl.readOnly = !linesEditable;
    if (!linesEditable) {
      row.querySelectorAll('.budget-line-card-actions').forEach(el => { el.style.visibility = 'hidden'; });
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
  const catUsd = categoryData ? (categoryData.usd_amount ?? categoryData.usdAmount ?? 0) : 0;
  let catLocal = categoryData
    ? formatLocalInput(categoryData.local_amount ?? categoryData.localAmount ?? '')
    : '0';
  if (categoryData && !catLocal) {
    const rate = parseFloat(categoryData.rate) || 0;
    const currency = categoryData.currency || '';
    if (currency === 'USD') catLocal = formatLocalInput(catUsd);
    else if (rate > 0) catLocal = formatLocalInput(Number(catUsd) * rate);
  }

  const row = document.createElement('div');
  row.className = 'budget-line-card category-row';
  if (isTemplate) row.dataset.template = 'true';
  if (isCustom) row.dataset.custom = 'true';

  row.innerHTML = buildCategoryRowHtml({
    displayName,
    category: normalized?.category || (isCustom ? '' : displayName),
    subcategory: normalized?.subcategory || '',
    localVal: catLocal || '0',
    usdVal: Number(catUsd || 0).toFixed(2),
    isTemplate,
    isCustom
  });

  container.appendChild(row);
  if (!options.deferLock) {
    recalculateBudgetUsdFromLocal(row, getEditBudgetHeaderCurrency());
  }
};

window.removeEditCategoryRow = function(btn) {
  window.removeBudgetCategoryRow(btn);
};

function applyEditBudgetNameState(budgetType) {
  const nameInput = document.getElementById('editBudgetName');
  const hint = document.getElementById('editBudgetNameHint');
  if (!nameInput) return;

  if (isMonthlyBudgetType(budgetType)) {
    nameInput.readOnly = true;
    if (hint) hint.style.display = '';
  } else {
    nameInput.readOnly = false;
    if (hint) hint.style.display = 'none';
  }
}

window.validateEditBudgetName = function(input) {
  const newName = input.value.trim();
  if (!newName) return;

  const budgetType = document.getElementById('editBudgetType')?.value || 'adhoc';
  if (isNamedBudgetType(budgetType) && isDateCnBudgetName(newName)) {
    input.style.borderColor = '#e0a800';
    showToast(DATE_CN_BUDGET_NAME_WARNING, 'warning');
  }

  const id = document.getElementById('editBudgetId').value;
  const allBudgets = state.budgetPlans || [];
  const teamId = state.currentTeam?.team_id;
  const duplicate = allBudgets.find(b => b.name.toLowerCase().trim() === newName.toLowerCase() && b.team_id === teamId && b.id !== id && !b.is_deleted);

  if (duplicate) {
    input.style.borderColor = '#dc3545';
    showToast('A budget with this name already exists in your team', 'warning');
  } else if (!(isNamedBudgetType(budgetType) && isDateCnBudgetName(newName))) {
    input.style.borderColor = '';
  }
};

window.saveEditedBudget = async function() {
  const id = document.getElementById('editBudgetId').value;
  const allBudgets = state.budgetPlans || state._budgets || [];
  const budgetIndex = allBudgets.findIndex(b => b.id === id);
  if (budgetIndex === -1) {
    showToast('Budget not found', 'error');
    return;
  }

  const existing = allBudgets[budgetIndex];
  const linesEditable = canEditBudgetLines(existing);
  const newStatus = document.getElementById('editBudgetStatus').value;

  if (!linesEditable && !isSystemAdmin()) {
    const onlyArchive = canArchiveBudget(existing) && newStatus === BUDGET_STATUS.ARCHIVED;
    if (!onlyArchive) {
      showToast('Only SYS can edit this budget', 'error');
      return;
    }
  }

  if (!state.canEditBudgets && !isSystemAdmin()) {
    showToast('You do not have permission to edit budgets', 'error');
    return;
  }

  const budgetType = document.getElementById('editBudgetType')?.value || 'adhoc';
  let newName = document.getElementById('editBudgetName').value.trim();

  if (isMonthlyBudgetType(budgetType)) {
    newName = existing.name;
  }

  if (!newName) {
    showToast('Please enter a budget name', 'error');
    return;
  }

  if (isNamedBudgetType(budgetType) && isDateCnBudgetName(newName)) {
    showToast(DATE_CN_BUDGET_NAME_WARNING, 'warning');
  }

  const teamId = state.currentTeam?.team_id;
  const duplicate = allBudgets.find(b => b.name.toLowerCase().trim() === newName.toLowerCase() && b.team_id === teamId && b.id !== id && !b.is_deleted);
  if (duplicate) {
    showToast('A budget with this name already exists in your team', 'error');
    return;
  }

  let categories = existing.categories || [];
  const { currency: headerCurrency, rate: headerRate } = getEditBudgetHeaderCurrency();

  if (linesEditable || isSystemAdmin()) {
    if (!headerCurrency) {
      showToast('Select a budget currency', 'error');
      return;
    }
    if (!(headerRate > 0) && headerCurrency !== 'USD') {
      showToast('Enter a valid exchange rate', 'error');
      return;
    }

    const rate = headerCurrency === 'USD' ? 1 : headerRate;
    categories = [];
    const rows = document.querySelectorAll('#editBudgetCategoriesContainer .category-row');

    rows.forEach(row => {
      const catCategory = row.querySelector('.budget-cat-category')?.value?.trim()
        || row.querySelector('.budget-cat-name')?.value?.trim()
        || row.querySelector('.budget-cat-name-value')?.value?.trim();
      const catSub = row.querySelector('.budget-cat-subcategory')?.value?.trim() || null;
      const usdRaw = parseFloat(row.querySelector('.budget-cat-usd')?.value);
      const usdAmount = Number.isFinite(usdRaw) ? usdRaw : 0;
      const localRaw = parseFloat(row.querySelector('.budget-cat-local')?.value);
      const localAmount = Number.isFinite(localRaw) ? localRaw : 0;

      if (catCategory) {
        categories.push({
          category: catCategory,
          subcategory: catSub,
          name: formatCategoryLabel(catCategory, catSub),
          usdAmount,
          localAmount,
          currency: headerCurrency,
          rate
        });
      }
    });

    if (categories.length === 0) {
      showToast('Please add at least one category', 'error');
      return;
    }
  }

  const totalAmount = categories.reduce((sum, c) => sum + (c.usdAmount || c.usd_amount || 0), 0);

  const updateData = {
    ...existing,
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
    const result = await sbUpdate('budget_plans', id, updateData);
    if (result && result.error) {
      throw new Error(result.error.message || 'Supabase update failed');
    }

    if (typeof localPut === 'function') {
      await localPut('budget_plans', updateData);
    }

    const all = await localGetAll('budget_plans');
    state.budgetPlans = all.filter(b => b.team_id === teamId && !b.is_deleted).map(normalizeBudgetPlan);

    if (btn) {
      btn.textContent = 'Save Changes';
      btn.disabled = false;
    }

    document.getElementById('editBudgetModal').classList.remove('active');
    showToast('Budget updated', 'success');
    await initViewBudgetsPage();
    if (launchWizardAfterEdit) {
      launchWizardAfterEdit = false;
      setTimeout(() => {
        window.submitBudgetApproval(id);
      }, 100);
    }
  } catch (err) {
    console.error('Save budget error:', err);
    showToast(err.message || 'Failed to save budget', 'error');
    if (btn) {
      btn.textContent = 'Save Changes';
      btn.disabled = false;
    }
  }
};

window.closeEditBudgetModal = function() {
  document.getElementById('editBudgetModal').classList.remove('active');
  budgetFormMode = 'create';
};

window.saveEditedBudgetAndSubmit = function(e) {
  if (e) e.preventDefault();
  launchWizardAfterEdit = true;
  window.saveEditedBudget();
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