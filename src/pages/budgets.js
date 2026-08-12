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

export async function ensureUnallocatedBudgetExists(teamId) {
  if (!teamId) return null;
  try {
    const { data: existing } = await supabaseClient
      .from('budget_plans')
      .select('id')
      .eq('team_id', teamId)
      .eq('budget_type', 'unallocated')
      .eq('is_deleted', false)
      .maybeSingle();

    if (existing) return existing.id;

    const newBudget = {
      team_id: teamId,
      name: 'Unallocated Funds',
      status: 'received',
      approval_status: 'APPROVED',
      budget_type: 'unallocated',
      categories: [],
      total_amount: 0,
      spent_amount: 0,
      created_by: state.user?.id,
      is_deleted: false
    };

    const { data: inserted, error } = await supabaseClient
      .from('budget_plans')
      .insert(newBudget)
      .select('id')
      .single();

    if (error) throw error;
    return inserted.id;
  } catch (err) {
    console.error('ensureUnallocatedBudgetExists error:', err);
    return null;
  }
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
      <div class="modal-content" style="max-width: 700px; padding: 15px; position: relative;">
        <button class="close-modal" onclick="window.closeWizardModal()" style="background:#cc241d; color:white; border:none; border-radius:4px; width:24px; height:24px; font-weight:bold; font-size:0.9em; display:flex; align-items:center; justify-content:center; position:absolute; top:12px; right:12px; cursor:pointer;">✖</button>
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; padding-right: 30px;">
          <h3 style="margin: 0; font-size: 1rem; font-weight: bold; color: #333;">Budget Submission Wizard</h3>
          <span id="wizardStepTitle" style="font-weight: bold; font-size: 0.85rem; color: #666;">Step 1 of 10</span>
        </div>
        <div class="wizard-progress-bar" style="height: 4px; background: #eee; border-radius: 2px; margin-bottom: 15px; position: relative;">
          <div id="wizardProgressBarFill" style="height: 100%; width: 10%; background: #28a745; border-radius: 2px; transition: width 0.3s ease;"></div>
        </div>
        <div id="wizardStepsContainer" class="form-stack"></div>
        <div class="wizard-footer" style="margin-top: 15px; display: flex; justify-content: space-between; align-items: center;">
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

     const isTeamLead = state.userTeamAccess?.access_level === 'lead' || 
                        state.userTeamAccess?.access_level === 'admin' || 
                        state.userTeamAccess?.access_level === 'oht' ||
                        state.user?.role === 'admin';
    const status = getBudgetStatus(budget);
    const showMarkReceived = isTeamLead && (status === BUDGET_STATUS.PAID || status === BUDGET_STATUS.APPROVED);
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

function renderWizardDetailsHtml(budget) {
  if (!budget || budget.budget_type !== 'monthly') return '';

  const explanation = budget.open_budgets_explanation?.text || budget.open_budgets_explanation || '';
  const cash = budget.recon_cash_balance != null ? `$${parseFloat(budget.recon_cash_balance).toFixed(2)}` : '—';
  const bank = budget.recon_bank_balance != null ? `$${parseFloat(budget.recon_bank_balance).toFixed(2)}` : '—';
  const remaining = budget.recon_remaining_funds != null ? `$${parseFloat(budget.recon_remaining_funds).toFixed(2)}` : '—';

  const housing = budget.submission_housing_info || {};
  const housingDetails = `
    Address: ${housing.address || '—'}<br>
    Rent: ${housing.rentAmount || '—'} | Roommates: ${housing.roommatesCount || '—'}<br>
    Landlord: ${housing.landlordContact || '—'} | Utilities: ${housing.utilitiesDetails || '—'}
  `;

  const accomplishments = (budget.submission_accomplishments?.data || budget.submission_accomplishments || [])
    .map(a => `<li><strong>${a.member || 'Member'}:</strong> ${a.accomplishments || '—'}</li>`).join('');

  const members = (budget.submission_team_info?.members || [])
    .map(m => `<li>${m.name || m}</li>`).join('');

  return `
    <div class="wizard-details-section" style="margin-top:20px; border-top:1px dashed var(--border); padding-top:16px;">
      <h4 style="margin:0 0 10px; color:var(--primary);">📋 Submission Metadata (Wizard Details)</h4>
      <div style="display:flex; flex-direction:column; gap:10px;">
        <details style="background:var(--card-bg); border:1px solid var(--border); border-radius:4px; padding:10px;">
          <summary style="cursor:pointer; font-weight:600; font-size:0.9rem;">Balances & Reconciliation</summary>
          <div style="margin-top:8px; font-size:0.85rem; line-height:1.5;">
            <div><strong>Cash Balance:</strong> ${cash}</div>
            <div><strong>Bank Balance:</strong> ${bank}</div>
            <div><strong>Remaining Funds:</strong> ${remaining}</div>
            ${explanation ? `<div style="margin-top:6px;"><strong>Prior Unresolved Budgets Explanation:</strong><br>${explanation}</div>` : ''}
          </div>
        </details>
        <details style="background:var(--card-bg); border:1px solid var(--border); border-radius:4px; padding:10px;">
          <summary style="cursor:pointer; font-weight:600; font-size:0.9rem;">Team Members & Housing</summary>
          <div style="margin-top:8px; font-size:0.85rem; line-height:1.5;">
            <div><strong>Members:</strong></div>
            <ul style="margin:4px 0 8px 16px; padding:0;">${members || '<li>None</li>'}</ul>
            <div><strong>Housing Info:</strong></div>
            <div style="padding-left:6px; margin-top:4px; line-height:1.4;">${housingDetails}</div>
          </div>
        </details>
        ${accomplishments ? `
        <details style="background:var(--card-bg); border:1px solid var(--border); border-radius:4px; padding:10px;">
          <summary style="cursor:pointer; font-weight:600; font-size:0.9rem;">Accomplishments & Goals</summary>
          <div style="margin-top:8px; font-size:0.85rem; line-height:1.4;">
            <ul style="margin:4px 0 0 16px; padding:0;">${accomplishments}</ul>
          </div>
        </details>` : ''}
      </div>
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

  let paymentInfoHtml = '';
  if (budget.paid_amount != null || budget.funding_notes) {
    const amt = budget.paid_amount != null ? `$${parseFloat(budget.paid_amount).toFixed(2)}` : '—';
    const notes = budget.funding_notes || '—';
    paymentInfoHtml = `
      <div class="payment-info-box" style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:4px; padding:10px; margin: 15px 0; font-size:0.85rem; color:#166534;">
        <strong>💰 Payment Recorded:</strong> Paid Amount: <strong>${amt}</strong> | Notes: <em>${escapeHtmlAttr(notes)}</em>
      </div>
    `;
  }

  const canSubmitApproval = showActions && canSubmitBudgetApproval() && canSubmitBudgetByStatus(budget);
  const submitBtn = canSubmitApproval
    ? `<button type="button" class="small success" onclick="event.stopPropagation(); window.submitBudgetApproval('${budget.id}')">Submit for approval</button>`
    : '';

  const isTeamLead = state.userTeamAccess?.access_level === 'lead' || 
                     state.userTeamAccess?.access_level === 'admin' || 
                     state.userTeamAccess?.access_level === 'oht' ||
                     state.user?.role === 'admin';
  const status = getBudgetStatus(budget);
  const showMarkReceived = isTeamLead && (status === BUDGET_STATUS.PAID || status === BUDGET_STATUS.APPROVED);
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
        ${renderWizardDetailsHtml(budget)}
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
      ${paymentInfoHtml}
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
      ${renderWizardDetailsHtml(budget)}
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
let wizardMembers = [];

function getWizardStepsForBudget(budget) {
  const type = String(budget?.budget_type || 'monthly').toLowerCase();
  if (type === 'monthly') {
    return [
      { step: 1, title: 'Step 1: Open Budgets Review', id: 'step-open-budgets' },
      { step: 2, title: 'Step 2: Close Previous Month Expenses', id: 'step-close-expenses' },
      { step: 3, title: 'Step 3: Bank & Cash Reconciliation', id: 'step-reconciliation' },
      { step: 4, title: 'Step 4: Team Allocation', id: 'step-team-allocation' },
      { step: 5, title: 'Step 5: Housing Details', id: 'step-housing-info' },
      { step: 6, title: 'Step 6: Accomplishments', id: 'step-accomplishments' },
      { step: 7, title: 'Step 7: Income Report', id: 'step-income-report' },
      { step: 8, title: 'Step 8: Social Media Tracking', id: 'step-social-media' },
      { step: 9, title: 'Step 9: Causing', id: 'step-causing' },
      { step: 10, title: 'Step 10: Final Review & Submit', id: 'step-final-submit' }
    ];
  } else if (type === 'medical') {
    return [
      { step: 1, title: 'Step 1: Medical Case Details', id: 'step-medical-details' },
      { step: 2, title: 'Step 2: Final Review & Submit', id: 'step-final-submit' }
    ];
  } else if (type === 'travel') {
    return [
      { step: 1, title: 'Step 1: Travel Itinerary', id: 'step-travel-details' },
      { step: 2, title: 'Step 2: Final Review & Submit', id: 'step-final-submit' }
    ];
  }
  return [
    { step: 1, title: 'Step 1: Final Review & Submit', id: 'step-final-submit' }
  ];
}

async function syncWizardDataToDB() {
  if (!wizardBudget) return;
  try {
    await supabaseClient
      .from('budget_plans')
      .update({
        open_budgets_explanation: wizardData.openBudgetsExplanation,
        recon_cash_balance: wizardData.cashBalance,
        recon_bank_balance: wizardData.bankBalance,
        recon_remaining_funds: wizardData.remainingFunds,
        submission_team_info: { 
          members: wizardMembers, 
          allocations: wizardData.allocations,
          expensesClosed: wizardData.expensesClosed,
          reconciliationConfirmed: wizardData.reconciliationConfirmed
        },
        submission_housing_info: wizardData.housingInfo,
        submission_accomplishments: { data: wizardData.accomplishmentsData },
        submission_income_report: { data: wizardData.incomeData },
        submission_social_media: { data: wizardData.socialMediaData },
        submission_coursing: { data: wizardData.causingData }
      })
      .eq('id', wizardBudget.id);
  } catch (err) {
    console.warn('Autosave sync failed:', err);
  }
}

window.closeWizardModal = function(force = false) {
  const doClose = () => {
    document.getElementById('submissionWizardModal').classList.remove('active');
    const btn = document.getElementById('wizardNextBtn');
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Next';
    }
    wizardBudget = null;
    wizardStep = 1;
    wizardData = {};
    wizardOpenBudgets = [];
    wizardBuckets = [];
    wizardMembers = [];
  };

  if (force) {
    doClose();
  } else {
    showConfirm('Quit the submission wizard? Unsaved changes in this step will be saved, and you can resume later.', async () => {
      saveStepData();
      await syncWizardDataToDB();
      doClose();
    });
  }
};

window.wizardPrevStep = async function() {
  if (wizardStep > 1) {
    saveStepData();
    await syncWizardDataToDB();
    wizardStep--;
    window.renderWizardStep();
  }
};

function getCategoryAllocations(categoryName, totalAmount) {
  let allocations = {};
  if (wizardData.allocations && wizardData.allocations[categoryName]) {
    allocations = { ...wizardData.allocations[categoryName] };
  }

  const memberIds = new Set(wizardMembers.map(m => m.id));
  const sum = Object.values(allocations).reduce((a, b) => a + b, 0);
  const hasAllMembers = wizardMembers.every(m => allocations[m.id] !== undefined && allocations[m.id] !== null);

  if (Object.keys(allocations).length === 0 || sum === 0 || !hasAllMembers) {
    const count = wizardMembers.length;
    if (count > 0) {
      const base = Math.floor((totalAmount / count) * 100) / 100;
      const totalAllocated = base * count;
      const remainder = Math.round((totalAmount - totalAllocated) * 100) / 100;
      allocations = {};
      wizardMembers.forEach(m => {
        allocations[m.id] = base;
      });
      const lead = wizardMembers.find(m => m.access_level === 'opl') || wizardMembers[0];
      if (lead && remainder !== 0) {
        allocations[lead.id] = Math.round((allocations[lead.id] + remainder) * 100) / 100;
      }
    }
  }

  Object.keys(allocations).forEach(id => {
    if (!memberIds.has(id)) {
      delete allocations[id];
    }
  });

  return allocations;
}

window.onAllocationChange = function(categoryIndex, memberId, inputEl) {
  const category = wizardBudget.categories[categoryIndex];
  const categoryName = category.name || category.category;
  const totalAmount = category.usdAmount || category.usd_amount || 0;
  let val = parseFloat(inputEl.value) || 0;
  if (val < 0) val = 0;
  if (val > totalAmount) {
    showToast(`Allocation cannot exceed category total of $${totalAmount}`, 'warning');
    val = totalAmount;
    inputEl.value = val.toFixed(2);
  }

  if (!wizardData.allocations) wizardData.allocations = {};
  if (!wizardData.allocations[categoryName]) {
    wizardData.allocations[categoryName] = getCategoryAllocations(categoryName, totalAmount);
  }

  wizardData.allocations[categoryName][memberId] = val;

  const otherMembers = wizardMembers.filter(m => m.id !== memberId);
  if (otherMembers.length > 0) {
    const remainder = totalAmount - val;
    if (remainder < 0) {
      showToast('Sum of allocations exceeds total category amount!', 'warning');
      window.renderWizardStep();
      return;
    }
    const base = Math.floor((remainder / otherMembers.length) * 100) / 100;
    const allocated = base * otherMembers.length;
    const roundingRemainder = Math.round((remainder - allocated) * 100) / 100;

    otherMembers.forEach(m => {
      wizardData.allocations[categoryName][m.id] = base;
    });

    const lead = otherMembers.find(m => m.access_level === 'opl') || otherMembers[0];
    if (lead && roundingRemainder !== 0) {
      wizardData.allocations[categoryName][lead.id] = Math.round((wizardData.allocations[categoryName][lead.id] + roundingRemainder) * 100) / 100;
    }
  }

  wizardMembers.forEach(m => {
    const input = document.getElementById(`alloc-${categoryIndex}-${m.id}`);
    if (input) {
      input.value = (wizardData.allocations[categoryName][m.id] || 0).toFixed(2);
    }
  });
};

function saveStepData() {
  const steps = getWizardStepsForBudget(wizardBudget);
  const type = String(wizardBudget?.budget_type || 'monthly').toLowerCase();
  if (type !== 'monthly') return; // Custom types handled individually

  if (wizardStep === 1) {
    const explanations = [];
    wizardOpenBudgets.forEach((ob, idx) => {
      const reason = document.getElementById(`ob-reason-${idx}`)?.value?.trim() || '';
      const status = document.getElementById(`ob-status-${idx}`)?.value?.trim() || '';
      const closure = document.getElementById(`ob-closure-${idx}`)?.value?.trim() || '';
      explanations.push({ budgetId: ob.id, name: ob.name, reason, status, closure });
    });
    wizardData.openBudgetsExplanation = explanations;
  } else if (wizardStep === 2) {
    wizardData.expensesClosed = document.getElementById('confirmExpensesClosed')?.checked || false;
  } else if (wizardStep === 3) {
    const totalBalance = wizardBuckets.reduce((sum, b) => sum + (b.balance || 0), 0);
    wizardData.cashBalance = totalBalance;
    wizardData.bankBalance = totalBalance;
    wizardData.remainingFunds = totalBalance;
    wizardData.reconciliationConfirmed = document.getElementById('confirmReconciliation')?.checked || false;
  } else if (wizardStep === 5) {
    const utils = [];
    if (document.getElementById('util-wifi')?.checked) utils.push('wifi');
    if (document.getElementById('util-gas')?.checked) utils.push('gas');
    if (document.getElementById('util-electricity')?.checked) utils.push('electricity');
    if (document.getElementById('util-water')?.checked) utils.push('water');
    if (document.getElementById('util-garbage')?.checked) utils.push('garbage');
    wizardData.housingInfo = {
      address: document.getElementById('house-address')?.value?.trim() || '',
      rent: parseFloat(document.getElementById('house-rent')?.value) || 0,
      mapUrl: document.getElementById('house-map')?.value?.trim() || '',
      ownerName: document.getElementById('house-owner')?.value?.trim() || '',
      ownerPhone: document.getElementById('house-phone')?.value?.trim() || '',
      bedrooms: parseInt(document.getElementById('house-bedrooms')?.value, 10) || 0,
      bathrooms: parseFloat(document.getElementById('house-bathrooms')?.value) || 0,
      occupants: parseInt(document.getElementById('house-occupants')?.value, 10) || 0,
      hasAgreement: document.getElementById('house-agreement-chk')?.checked || false,
      agreementFile: document.getElementById('house-agreement-file')?.value?.trim() || '',
      utilities: utils,
      furnished: document.getElementById('house-furnished')?.value || 'no'
    };
  } else if (wizardStep === 6) {
    const accData = {};
    wizardMembers.forEach(m => {
      accData[m.id] = {
        accomplishments: document.getElementById(`acc-text-${m.id}`)?.value?.trim() || '',
        goals: document.getElementById(`goals-text-${m.id}`)?.value?.trim() || ''
      };
    });
    wizardData.accomplishmentsData = accData;
  } else if (wizardStep === 7) {
    const incData = {};
    wizardMembers.forEach(m => {
      incData[m.id] = {
        sevas: parseFloat(document.getElementById(`inc-sevas-${m.id}`)?.value) || 0,
        business: parseFloat(document.getElementById(`inc-business-${m.id}`)?.value) || 0,
        donations: parseFloat(document.getElementById(`inc-donations-${m.id}`)?.value) || 0
      };
    });
    wizardData.incomeData = incData;
  } else if (wizardStep === 8) {
    const smData = {};
    wizardMembers.forEach(m => {
      smData[m.id] = {
        handles: document.getElementById(`sm-handles-${m.id}`)?.value?.trim() || '',
        yoga: parseInt(document.getElementById(`sm-yoga-${m.id}`)?.value, 10) || 0,
        other: parseInt(document.getElementById(`sm-other-${m.id}`)?.value, 10) || 0
      };
    });
    wizardData.socialMediaData = smData;
  } else if (wizardStep === 9) {
    const causData = {};
    wizardMembers.forEach(m => {
      causData[m.id] = {
        adheenavasis: parseInt(document.getElementById(`caus-adheenavasis-${m.id}`)?.value, 10) || 0,
        pss: parseInt(document.getElementById(`caus-pss-${m.id}`)?.value, 10) || 0,
        sjp: parseInt(document.getElementById(`caus-sjp-${m.id}`)?.value, 10) || 0
      };
    });
    wizardData.causingData = causData;
  }
}

function validateStep(stepOrder) {
  const errors = [];
  const type = String(wizardBudget?.budget_type || 'monthly').toLowerCase();
  if (type !== 'monthly') return errors;

  if (stepOrder === 1) {
    if (wizardOpenBudgets.length > 0) {
      const exp = wizardData.openBudgetsExplanation || [];
      if (exp.length < wizardOpenBudgets.length || exp.some(e => !e.reason || !e.status || !e.closure)) {
        errors.push("Step 1: All open budgets must have status, reason and expected closure completed.");
      }
    }
  } else if (stepOrder === 2) {
    if (!wizardData.expensesClosed) {
      errors.push("Step 2: You must check the box to confirm that previous month expenses are frozen.");
    }
  } else if (stepOrder === 3) {
    if (!wizardData.reconciliationConfirmed) {
      errors.push("Step 3: You must check the box to confirm the reconciliation details are correct.");
    }
  } else if (stepOrder === 4) {
    (wizardBudget.categories || []).forEach(cat => {
      const categoryName = cat.name || cat.category;
      const totalAmount = cat.usdAmount || cat.usd_amount || 0;
      const allocs = wizardData.allocations?.[categoryName] || {};
      const sum = Object.values(allocs).reduce((a, b) => a + b, 0);
      if (Math.abs(sum - totalAmount) > 0.02) {
        errors.push(`Step 4: Allocations for "${categoryName}" ($${sum.toFixed(2)}) must sum to total amount ($${totalAmount.toFixed(2)}).`);
      }
    });
  } else if (stepOrder === 5) {
    const h = wizardData.housingInfo || {};
    if (!h.address) errors.push("Step 5: Housing address is required.");
    if (!(h.rent > 0)) errors.push("Step 5: Rent is required.");
    if (!h.ownerName) errors.push("Step 5: Housing owner name is required.");
    if (!h.ownerPhone) errors.push("Step 5: Housing owner phone is required.");
    if (!(h.bedrooms > 0)) errors.push("Step 5: Number of bedrooms is required.");
    if (!(h.bathrooms > 0)) errors.push("Step 5: Number of bathrooms is required.");
    if (!(h.occupants > 0)) errors.push("Step 5: Total occupants is required.");
  } else if (stepOrder === 6) {
    const acc = wizardData.accomplishmentsData || {};
    wizardMembers.forEach(m => {
      const val = acc[m.id] || {};
      if (!val.accomplishments) errors.push(`Step 6: Accomplishments for ${m.name} is required.`);
      if (!val.goals) errors.push(`Step 6: Goals for ${m.name} is required.`);
    });
  } else if (stepOrder === 7) {
    const inc = wizardData.incomeData || {};
    wizardMembers.forEach(m => {
      const val = inc[m.id] || {};
      if (val.sevas === undefined || val.business === undefined || val.donations === undefined) {
        errors.push(`Step 7: All income fields for ${m.name} are required.`);
      }
    });
  } else if (stepOrder === 8) {
    const sm = wizardData.socialMediaData || {};
    wizardMembers.forEach(m => {
      const val = sm[m.id] || {};
      if (val.yoga === undefined || val.other === undefined) {
        errors.push(`Step 8: Social media post counts for ${m.name} are required.`);
      }
    });
  } else if (stepOrder === 9) {
    const caus = wizardData.causingData || {};
    wizardMembers.forEach(m => {
      const val = caus[m.id] || {};
      if (val.adheenavasis === undefined || val.pss === undefined || val.sjp === undefined) {
        errors.push(`Step 9: Causing outreach counts for ${m.name} are required.`);
      }
    });
  }
  return errors;
}

window.wizardNextStep = async function() {
  saveStepData();
  const steps = getWizardStepsForBudget(wizardBudget);

  if (wizardStep === steps.length) {
    // Perform final check of all steps
    const allErrors = [];
    for (let s = 1; s < steps.length; s++) {
      allErrors.push(...validateStep(s));
    }
    if (allErrors.length > 0) {
      showToast(allErrors[0], 'warning');
      for (let s = 1; s < steps.length; s++) {
        if (validateStep(s).length > 0) {
          wizardStep = s;
          window.renderWizardStep();
          break;
        }
      }
      return;
    }

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
          submission_team_info: { members: wizardMembers, allocations: wizardData.allocations },
          submission_housing_info: wizardData.housingInfo,
          submission_accomplishments: { data: wizardData.accomplishmentsData },
          submission_income_report: { data: wizardData.incomeData },
          submission_social_media: { data: wizardData.socialMediaData },
          submission_coursing: { data: wizardData.causingData }
        })
        .eq('id', wizardBudget.id);

      if (updateErr) throw updateErr;

      const { error: freezeErr } = await supabaseClient
        .from('expenses')
        .update({ is_frozen: true })
        .eq('team_id', wizardBudget.team_id)
        .eq('is_frozen', false);

      if (freezeErr) console.warn('Non-blocking expenses freeze warning:', freezeErr);

      const request = await submitBudgetForApproval(wizardBudget);
      showToast(`Submitted as ${request.request_number}`, 'success');
      window.closeWizardModal(true);
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
  const updatePayload = {};
  if (wizardStep === 1) {
    updatePayload.open_budgets_explanation = wizardData.openBudgetsExplanation;
  } else if (wizardStep === 3) {
    updatePayload.recon_cash_balance = wizardData.cashBalance;
    updatePayload.recon_bank_balance = wizardData.bankBalance;
    updatePayload.recon_remaining_funds = wizardData.remainingFunds;
  } else if (wizardStep === 4) {
    updatePayload.submission_team_info = { members: wizardMembers, allocations: wizardData.allocations };
  } else if (wizardStep === 5) {
    updatePayload.submission_housing_info = wizardData.housingInfo;
  } else if (wizardStep === 6) {
    updatePayload.submission_accomplishments = { data: wizardData.accomplishmentsData };
  } else if (wizardStep === 7) {
    updatePayload.submission_income_report = { data: wizardData.incomeData };
  } else if (wizardStep === 8) {
    updatePayload.submission_social_media = { data: wizardData.socialMediaData };
  } else if (wizardStep === 9) {
    updatePayload.submission_coursing = { data: wizardData.causingData };
  }

  if (Object.keys(updatePayload).length > 0) {
    const { error: autosaveErr } = await supabaseClient
      .from('budget_plans')
      .update(updatePayload)
      .eq('id', wizardBudget.id);
    if (autosaveErr) {
      console.error('Autosave failed:', autosaveErr);
      showToast(`Autosave failed: ${autosaveErr.message}`, 'error');
      return;
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

  const steps = getWizardStepsForBudget(wizardBudget);
  const currentConfig = steps.find(s => s.step === wizardStep);
  if (!currentConfig) return;
  title.textContent = `${currentConfig.title}`;
  fill.style.width = `${(wizardStep / steps.length) * 100}%`;
  prevBtn.style.display = wizardStep === 1 ? 'none' : 'inline-block';
  nextBtn.textContent = wizardStep === steps.length ? 'Submit' : 'Next';

  const todayStr = new Date().toISOString().split('T')[0];

  const type = String(wizardBudget?.budget_type || 'monthly').toLowerCase();
  if (type !== 'monthly') {
    // Non-monthly fallback render
    if (wizardStep === steps.length) {
      container.innerHTML = `
        <div class="card" style="padding: 15px; border-radius: 8px; border: 1px solid #ddd;">
          <p>This is a ${type} budget plan proposal. Ready for submission review.</p>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div class="card" style="padding: 15px; border-radius: 8px; border: 1px solid #ddd;">
          <p>Dynamic step content details for ${type} budgets.</p>
        </div>
      `;
    }
    return;
  }

  let html = '';
  if (wizardStep === 1) {
    if (!wizardOpenBudgets.length) {
      html = `
        <div class="card" style="padding: 15px; border: 1px solid #ddd; border-radius: 8px;">
          <p style="color: #28a745; font-weight: bold; margin: 0;">✓ You do not have any other open active budgets.</p>
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
      <div class="card" style="padding: 10px; border-radius: 8px; border: 1px solid #ddd; font-size: 0.9rem;">
        <p class="section-hint" style="margin-bottom: 10px; font-size: 0.85rem;">Below is the current balance of all active buckets associated with this budget Proposal:</p>
        <div style="margin-bottom: 10px; border: 1px solid #eee; padding: 8px; border-radius: 6px; background: #fafafa;">
          ${wizardBuckets.map(b => `
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #eee; padding: 4px 0;">
              <span>${escapeHtmlAttr(b.name)} (${escapeHtmlAttr(b.currency || 'USD')})</span>
              <span style="font-weight: bold;">$${Number(b.balance || 0).toFixed(2)}</span>
            </div>
          `).join('')}
          <div style="display: flex; justify-content: space-between; border-top: 2px solid #ccc; padding-top: 8px; margin-top: 8px; font-weight: bold; color: #28a745;">
            <span>Total Balance</span>
            <span>$${totalBalance.toFixed(2)}</span>
          </div>
        </div>
        <label style="display: inline-flex; align-items: center; gap: 8px; font-weight: bold; cursor: pointer; margin-top: 5px; font-size: 0.85rem;">
          <input type="checkbox" id="confirmReconciliation" style="transform: scale(1.1);" ${wizardData.reconciliationConfirmed ? 'checked' : ''}>
          I confirm the reconciliation details are correct
        </label>
      </div>
    `;
  } else if (wizardStep === 4) {
    html = `
      <div class="card" style="padding: 10px; border-radius: 8px; border: 1px solid #ddd; max-height: 400px; overflow-y: auto; font-size: 0.9rem;">
        ${(wizardBudget.categories || []).map((cat, catIdx) => {
          const categoryName = cat.name || cat.category;
          const total = cat.usdAmount || cat.usd_amount || 0;
          const allocs = getCategoryAllocations(categoryName, total);
          if (!wizardData.allocations) wizardData.allocations = {};
          wizardData.allocations[categoryName] = allocs;

          return `
            <div style="margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 15px;">
              <h5 style="margin: 0 0 10px 0; color: #007bff;">${escapeHtmlAttr(categoryName)} (Total: $${total.toFixed(2)})</h5>
              <div style="display: flex; flex-direction: column; gap: 8px; max-width: 400px;">
                ${wizardMembers.map(m => `
                  <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
                    <span style="font-size: 0.9em; font-weight: 500; min-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtmlAttr(m.name)}</span>
                    <input type="number" step="0.01" min="0" max="${total}" 
                           id="alloc-${catIdx}-${m.id}" 
                           value="${(allocs[m.id] || 0).toFixed(2)}"
                           onchange="window.onAllocationChange(${catIdx}, '${m.id}', this)"
                           style="width: 100px; height: 32px; text-align: right; border-radius: 4px; border: 1px solid var(--border); padding: 4px 8px; box-sizing: border-box;">
                  </div>
                `).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  } else if (wizardStep === 5) {
    const h = wizardData.housingInfo || {};
    html = `
      <div class="card" style="padding: 12px; border-radius: 8px; border: 1px solid #ddd; max-height: 400px; overflow-y: auto; font-size: 0.9rem;">
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <label style="min-width: 120px; font-weight: bold; margin: 0;">Address *</label>
            <input type="text" id="house-address" value="${escapeHtmlAttr(h.address || '')}" required style="flex: 1; min-width: 200px; height: 28px; border-radius: 4px; border: 1px solid var(--border); padding: 2px 6px; box-sizing: border-box;">
          </div>
          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <label style="min-width: 120px; font-weight: bold; margin: 0;">Rent (USD eq) *</label>
            <input type="number" step="0.01" id="house-rent" value="${h.rent ?? ''}" required style="flex: 1; min-width: 200px; height: 28px; border-radius: 4px; border: 1px solid var(--border); padding: 2px 6px; box-sizing: border-box;">
          </div>
          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <label style="min-width: 120px; font-weight: bold; margin: 0;">Location Map URL</label>
            <input type="text" id="house-map" value="${escapeHtmlAttr(h.mapUrl || '')}" style="flex: 1; min-width: 200px; height: 28px; border-radius: 4px; border: 1px solid var(--border); padding: 2px 6px; box-sizing: border-box;">
          </div>
          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <label style="min-width: 120px; font-weight: bold; margin: 0;">Owner Name *</label>
            <input type="text" id="house-owner" value="${escapeHtmlAttr(h.ownerName || '')}" required style="flex: 1; min-width: 200px; height: 28px; border-radius: 4px; border: 1px solid var(--border); padding: 2px 6px; box-sizing: border-box;">
          </div>
          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <label style="min-width: 120px; font-weight: bold; margin: 0;">Owner Phone *</label>
            <input type="text" id="house-phone" value="${escapeHtmlAttr(h.ownerPhone || '')}" required style="flex: 1; min-width: 200px; height: 28px; border-radius: 4px; border: 1px solid var(--border); padding: 2px 6px; box-sizing: border-box;">
          </div>
          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <label style="min-width: 120px; font-weight: bold; margin: 0;">Bed/Bath/Occupants *</label>
            <div style="display: flex; gap: 6px; flex: 1; min-width: 200px; box-sizing: border-box;">
              <input type="number" id="house-bedrooms" placeholder="Beds" value="${h.bedrooms ?? ''}" required style="width: 33%; height: 28px; border-radius: 4px; border: 1px solid var(--border); padding: 2px 6px; box-sizing: border-box;">
              <input type="number" step="0.5" id="house-bathrooms" placeholder="Baths" value="${h.bathrooms ?? ''}" required style="width: 33%; height: 28px; border-radius: 4px; border: 1px solid var(--border); padding: 2px 6px; box-sizing: border-box;">
              <input type="number" id="house-occupants" placeholder="People" value="${h.occupants ?? ''}" required style="width: 34%; height: 28px; border-radius: 4px; border: 1px solid var(--border); padding: 2px 6px; box-sizing: border-box;">
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <label style="min-width: 120px; font-weight: bold; margin: 0; display: inline-flex; align-items: center; gap: 4px;">
              <input type="checkbox" id="house-agreement-chk" ${h.hasAgreement ? 'checked' : ''}> Agreement?
            </label>
            <input type="text" id="house-agreement-file" value="${escapeHtmlAttr(h.agreementFile || '')}" placeholder="Agreement Link / Note" style="flex: 1; min-width: 200px; height: 28px; border-radius: 4px; border: 1px solid var(--border); padding: 2px 6px; box-sizing: border-box;">
          </div>
          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <label style="min-width: 120px; font-weight: bold; margin: 0;">Furnished State *</label>
            <select id="house-furnished" style="flex: 1; min-width: 200px; height: 28px; border-radius: 4px; border: 1px solid var(--border); padding: 2px 6px; box-sizing: border-box;">
              <option value="no" ${h.furnished === 'no' ? 'selected' : ''}>No</option>
              <option value="partial" ${h.furnished === 'partial' ? 'selected' : ''}>Partial</option>
              <option value="full" ${h.furnished === 'full' ? 'selected' : ''}>Full</option>
            </select>
          </div>
          <div style="margin-top: 5px;">
            <strong style="display: block; margin-bottom: 4px;">Utilities Provided:</strong>
            <div style="display: flex; gap: 12px; flex-wrap: wrap; font-size: 0.85rem;">
              <label style="cursor: pointer; display: inline-flex; align-items: center; gap: 4px;"><input type="checkbox" id="util-wifi" ${(h.utilities || []).includes('wifi') ? 'checked' : ''}> Wifi</label>
              <label style="cursor: pointer; display: inline-flex; align-items: center; gap: 4px;"><input type="checkbox" id="util-gas" ${(h.utilities || []).includes('gas') ? 'checked' : ''}> Gas</label>
              <label style="cursor: pointer; display: inline-flex; align-items: center; gap: 4px;"><input type="checkbox" id="util-electricity" ${(h.utilities || []).includes('electricity') ? 'checked' : ''}> Elec</label>
              <label style="cursor: pointer; display: inline-flex; align-items: center; gap: 4px;"><input type="checkbox" id="util-water" ${(h.utilities || []).includes('water') ? 'checked' : ''}> Water</label>
              <label style="cursor: pointer; display: inline-flex; align-items: center; gap: 4px;"><input type="checkbox" id="util-garbage" ${(h.utilities || []).includes('garbage') ? 'checked' : ''}> Trash</label>
            </div>
          </div>
        </div>
      </div>
    `;
  } else if (wizardStep === 6) {
    html = `
      <div class="card" style="padding: 15px; border-radius: 8px; border: 1px solid #ddd; max-height: 400px; overflow-y: auto;">
        <h4 style="margin-top: 0; margin-bottom: 15px;">Accomplishments &amp; Goals</h4>
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; min-width: 500px;">
            <thead>
              <tr style="background: #f1f1f1; text-align: left;">
                <th style="padding: 8px; border: 1px solid #ddd;">Member</th>
                <th style="padding: 8px; border: 1px solid #ddd;">Accomplishments *</th>
                <th style="padding: 8px; border: 1px solid #ddd;">Goals *</th>
              </tr>
            </thead>
            <tbody>
              ${wizardMembers.map(m => {
                const accVal = wizardData.accomplishmentsData?.[m.id] || {};
                return `
                  <tr>
                    <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold; width: 20%;">${escapeHtmlAttr(m.name)}</td>
                    <td style="padding: 8px; border: 1px solid #ddd;">
                      <textarea id="acc-text-${m.id}" placeholder="Accomplishments" required style="width: 100%; min-height: 50px; margin: 0; box-sizing: border-box;">${escapeHtmlAttr(accVal.accomplishments || '')}</textarea>
                    </td>
                    <td style="padding: 8px; border: 1px solid #ddd;">
                      <textarea id="goals-text-${m.id}" placeholder="Goals" required style="width: 100%; min-height: 50px; margin: 0; box-sizing: border-box;">${escapeHtmlAttr(accVal.goals || '')}</textarea>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } else if (wizardStep === 7) {
    html = `
      <div class="card" style="padding: 15px; border-radius: 8px; border: 1px solid #ddd; max-height: 400px; overflow-y: auto;">
        <h4 style="margin-top: 0; margin-bottom: 15px;">Income Report</h4>
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; min-width: 500px;">
            <thead>
              <tr style="background: #f1f1f1; text-align: left;">
                <th style="padding: 8px; border: 1px solid #ddd;">Member</th>
                <th style="padding: 8px; border: 1px solid #ddd;">Sevas *</th>
                <th style="padding: 8px; border: 1px solid #ddd;">Business *</th>
                <th style="padding: 8px; border: 1px solid #ddd;">Donations *</th>
              </tr>
            </thead>
            <tbody>
              ${wizardMembers.map(m => {
                const incVal = wizardData.incomeData?.[m.id] || {};
                return `
                  <tr>
                    <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold; width: 20%;">${escapeHtmlAttr(m.name)}</td>
                    <td style="padding: 8px; border: 1px solid #ddd;">
                      <input type="number" step="0.01" id="inc-sevas-${m.id}" value="${incVal.sevas ?? 0}" required style="width: 100%; margin: 0; box-sizing: border-box;">
                    </td>
                    <td style="padding: 8px; border: 1px solid #ddd;">
                      <input type="number" step="0.01" id="inc-business-${m.id}" value="${incVal.business ?? 0}" required style="width: 100%; margin: 0; box-sizing: border-box;">
                    </td>
                    <td style="padding: 8px; border: 1px solid #ddd;">
                      <input type="number" step="0.01" id="inc-donations-${m.id}" value="${incVal.donations ?? 0}" required style="width: 100%; margin: 0; box-sizing: border-box;">
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } else if (wizardStep === 8) {
    html = `
      <div class="card" style="padding: 15px; border-radius: 8px; border: 1px solid #ddd; max-height: 400px; overflow-y: auto;">
        <h4 style="margin-top: 0; margin-bottom: 15px;">Social Media Tracking</h4>
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; min-width: 550px;">
            <thead>
              <tr style="background: #f1f1f1; text-align: left;">
                <th style="padding: 8px; border: 1px solid #ddd;">Member</th>
                <th style="padding: 8px; border: 1px solid #ddd;">SM Handles</th>
                <th style="padding: 8px; border: 1px solid #ddd;">Yoga Videos *</th>
                <th style="padding: 8px; border: 1px solid #ddd;">Other Posts *</th>
              </tr>
            </thead>
            <tbody>
              ${wizardMembers.map(m => {
                const smVal = wizardData.socialMediaData?.[m.id] || {};
                return `
                  <tr>
                    <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold; width: 20%;">${escapeHtmlAttr(m.name)}</td>
                    <td style="padding: 8px; border: 1px solid #ddd;">
                      <input type="text" id="sm-handles-${m.id}" value="${escapeHtmlAttr(smVal.handles || '')}" placeholder="Handles" style="width: 100%; margin: 0; box-sizing: border-box;">
                    </td>
                    <td style="padding: 8px; border: 1px solid #ddd;">
                      <input type="number" id="sm-yoga-${m.id}" value="${smVal.yoga ?? 0}" required style="width: 100%; margin: 0; box-sizing: border-box;">
                    </td>
                    <td style="padding: 8px; border: 1px solid #ddd;">
                      <input type="number" id="sm-other-${m.id}" value="${smVal.other ?? 0}" required style="width: 100%; margin: 0; box-sizing: border-box;">
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } else if (wizardStep === 9) {
    html = `
      <div class="card" style="padding: 15px; border-radius: 8px; border: 1px solid #ddd; max-height: 400px; overflow-y: auto;">
        <h4 style="margin-top: 0; margin-bottom: 15px;">Causing</h4>
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; min-width: 500px;">
            <thead>
              <tr style="background: #f1f1f1; text-align: left;">
                <th style="padding: 8px; border: 1px solid #ddd;">Member</th>
                <th style="padding: 8px; border: 1px solid #ddd;">Adheenavasis *</th>
                <th style="padding: 8px; border: 1px solid #ddd;">PSS *</th>
                <th style="padding: 8px; border: 1px solid #ddd;">SJP *</th>
              </tr>
            </thead>
            <tbody>
              ${wizardMembers.map(m => {
                const causVal = wizardData.causingData?.[m.id] || {};
                return `
                  <tr>
                    <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold; width: 20%;">${escapeHtmlAttr(m.name)}</td>
                    <td style="padding: 8px; border: 1px solid #ddd;">
                      <input type="number" id="caus-adheenavasis-${m.id}" value="${causVal.adheenavasis ?? 0}" required style="width: 100%; margin: 0; box-sizing: border-box;">
                    </td>
                    <td style="padding: 8px; border: 1px solid #ddd;">
                      <input type="number" id="caus-pss-${m.id}" value="${causVal.pss ?? 0}" required style="width: 100%; margin: 0; box-sizing: border-box;">
                    </td>
                    <td style="padding: 8px; border: 1px solid #ddd;">
                      <input type="number" id="caus-sjp-${m.id}" value="${causVal.sjp ?? 0}" required style="width: 100%; margin: 0; box-sizing: border-box;">
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } else if (wizardStep === 10) {
    const totalBudget = wizardBudget.total_amount || wizardBudget.totalAmount || 0;
    const memberCount = wizardMembers.length || 1;
    const avgCost = totalBudget / memberCount;

    let stepsHtml = `
      <div style="margin-top: 20px; border-top: 1px solid #ccc; padding-top: 15px; font-size: 0.9rem;">
        <h4 style="margin: 0 0 10px 0; color: #333;">Detailed Step-by-Step Submissions</h4>
        
        <div style="margin-bottom: 15px; padding: 10px; background: #fafafa; border: 1px solid #eee; border-radius: 6px;">
          <strong>Step 1: Open Budgets Review</strong>
          ${(wizardData.openBudgetsExplanation || []).length === 0 ? '<p style="margin:4px 0 0; color:#666;">No open budgets required explanation.</p>' : 
            wizardData.openBudgetsExplanation.map(e => `
              <div style="margin-top:6px; padding-left:10px; border-left:2px solid #ffc107;">
                <div><strong>Budget:</strong> ${escapeHtmlAttr(e.name)}</div>
                <div><strong>Reason Open:</strong> ${escapeHtmlAttr(e.reason)}</div>
                <div><strong>Status:</strong> ${escapeHtmlAttr(e.status)} | <strong>Expected Closure:</strong> ${e.closure}</div>
              </div>
            `).join('')}
        </div>

        <div style="margin-bottom: 15px; padding: 10px; background: #fafafa; border: 1px solid #eee; border-radius: 6px;">
          <strong>Step 2: Close Previous Month Expenses</strong>
          <p style="margin:4px 0 0; color:#28a745;">✓ Confirmed: Previous month expenses are frozen</p>
        </div>

        <div style="margin-bottom: 15px; padding: 10px; background: #fafafa; border: 1px solid #eee; border-radius: 6px;">
          <strong>Step 3: Bank & Cash Reconciliation</strong>
          <div style="margin-top:6px; padding-left:10px;">
            ${wizardBuckets.map(b => `
              <div>${escapeHtmlAttr(b.name)}: $${Number(b.balance || 0).toFixed(2)}</div>
            `).join('')}
            <div style="font-weight:bold; margin-top:4px;">Total Balance: $${Number(wizardData.bankBalance || 0).toFixed(2)}</div>
          </div>
        </div>

        <div style="margin-bottom: 15px; padding: 10px; background: #fafafa; border: 1px solid #eee; border-radius: 6px;">
          <strong>Step 4: Team Allocation Splits</strong>
          <div style="margin-top:6px; padding-left:10px;">
            ${(wizardBudget.categories || []).map(cat => {
              const catName = cat.name || cat.category;
              const allocs = wizardData.allocations?.[catName] || {};
              return `
                <div style="margin-bottom: 8px;">
                  <span style="color:#007bff; font-weight:bold;">${escapeHtmlAttr(catName)}:</span>
                  <div style="display:flex; flex-wrap:wrap; gap:10px; padding-left:10px; font-size:0.85rem; margin-top:2px;">
                    ${wizardMembers.map(m => `
                      <span>${escapeHtmlAttr(m.name)}: $${Number(allocs[m.id] || 0).toFixed(2)}</span>
                    `).join('')}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div style="margin-bottom: 15px; padding: 10px; background: #fafafa; border: 1px solid #eee; border-radius: 6px;">
          <strong>Step 5: Housing Details</strong>
          <div style="margin-top:6px; padding-left:10px; display:grid; grid-template-columns: 1fr 1fr; gap:6px;">
            <div><strong>Address:</strong> ${escapeHtmlAttr(wizardData.housingInfo?.address || 'N/A')}</div>
            <div><strong>Rent:</strong> $${(wizardData.housingInfo?.rent || 0).toFixed(2)}</div>
            <div><strong>Owner Name:</strong> ${escapeHtmlAttr(wizardData.housingInfo?.ownerName || 'N/A')}</div>
            <div><strong>Owner Phone:</strong> ${escapeHtmlAttr(wizardData.housingInfo?.ownerPhone || 'N/A')}</div>
            <div><strong>Bedrooms:</strong> ${wizardData.housingInfo?.bedrooms || 0}</div>
            <div><strong>Bathrooms:</strong> ${wizardData.housingInfo?.bathrooms || 0}</div>
            <div><strong>Occupants:</strong> ${wizardData.housingInfo?.occupants || 0}</div>
            <div><strong>Furnished:</strong> ${wizardData.housingInfo?.furnished || 'no'}</div>
            <div style="grid-column: span 2;"><strong>Utilities:</strong> ${(wizardData.housingInfo?.utilities || []).join(', ') || 'None'}</div>
          </div>
        </div>

        <div style="margin-bottom: 15px; padding: 10px; background: #fafafa; border: 1px solid #eee; border-radius: 6px;">
          <strong>Step 6: Member Accomplishments & Goals</strong>
          <div style="margin-top:6px; padding-left:10px;">
            ${wizardMembers.map(m => {
              const acc = wizardData.accomplishmentsData?.[m.id] || {};
              return `
                <div style="margin-bottom: 6px;">
                  <strong>${escapeHtmlAttr(m.name)}:</strong>
                  <div style="padding-left:10px; font-size:0.85rem; color:#555;">
                    <div>Accomplishments: ${escapeHtmlAttr(acc.accomplishments || 'None')}</div>
                    <div>Goals: ${escapeHtmlAttr(acc.goals || 'None')}</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div style="margin-bottom: 15px; padding: 10px; background: #fafafa; border: 1px solid #eee; border-radius: 6px;">
          <strong>Step 7: Member Income Report</strong>
          <div style="margin-top:6px; padding-left:10px;">
            ${wizardMembers.map(m => {
              const inc = wizardData.incomeData?.[m.id] || {};
              return `
                <div>${escapeHtmlAttr(m.name)}: Sevas: $${Number(inc.sevas || 0).toFixed(2)} | Business: $${Number(inc.business || 0).toFixed(2)} | Donations: $${Number(inc.donations || 0).toFixed(2)}</div>
              `;
            }).join('')}
          </div>
        </div>

        <div style="margin-bottom: 15px; padding: 10px; background: #fafafa; border: 1px solid #eee; border-radius: 6px;">
          <strong>Step 8: Member Social Media Tracking</strong>
          <div style="margin-top:6px; padding-left:10px;">
            ${wizardMembers.map(m => {
              const sm = wizardData.socialMediaData?.[m.id] || {};
              return `
                <div>${escapeHtmlAttr(m.name)}: Yoga: ${sm.yoga || 0} posts | Other: ${sm.other || 0} posts | Handles: ${escapeHtmlAttr(sm.handles || 'None')}</div>
              `;
            }).join('')}
          </div>
        </div>

        <div style="margin-bottom: 15px; padding: 10px; background: #fafafa; border: 1px solid #eee; border-radius: 6px;">
          <strong>Step 9: Causing Outreach</strong>
          <div style="margin-top:6px; padding-left:10px;">
            ${wizardMembers.map(m => {
              const caus = wizardData.causingData?.[m.id] || {};
              return `
                <div>${escapeHtmlAttr(m.name)}: Adheenavasis: ${caus.adheenavasis || 0} | PSS: ${caus.pss || 0} | SJP: ${caus.sjp || 0}</div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;

    const teamName = state.teams.find(t => t.team_id === wizardBudget.team_id)?.team_name || 'Team';

    html = `
      <div class="card" style="padding: 15px; border-radius: 8px; border: 1px solid #ddd; max-height: 500px; overflow-y: auto;">
        <h3 style="margin-top: 0; margin-bottom: 5px; color: var(--primary); font-family: var(--font-family);">${escapeHtmlAttr(teamName)}</h3>
        <h4 style="margin-top: 0; border-bottom: 1px solid #eee; padding-bottom: 8px; color: #28a745;">Submission Summary &amp; Verification</h4>
        <p style="margin-bottom: 15px; font-weight: bold; color: #cc241d;">⚠ Please verify the financial numbers and category allocations below before submitting.</p>
        
        <div style="background: #f8f9fa; border: 1px solid #ddd; padding: 12px; border-radius: 6px; margin-bottom: 20px; font-size: 0.95rem; line-height: 1.6;">
          <div><strong>Budget Proposal Name:</strong> ${escapeHtmlAttr(wizardBudget.name)}</div>
          <div><strong>Total Proposed USD:</strong> $${totalBudget.toFixed(2)}</div>
          <div><strong>Team size:</strong> ${memberCount} member(s)</div>
          <div style="color: #007bff; font-weight: bold;"><strong>Average USD Cost per Person:</strong> $${avgCost.toFixed(2)}</div>
          <div style="color: #28a745; font-weight: bold;"><strong>Total Reconciliation Cash on Hand:</strong> $${Number(wizardData.bankBalance || 0).toFixed(2)}</div>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 0.9rem;">
          <thead>
            <tr style="background: #f1f1f1; text-align: left;">
              <th style="padding: 6px; border: 1px solid #ddd;">Category</th>
              <th style="padding: 6px; border: 1px solid #ddd;">Local Amount</th>
              <th style="padding: 6px; border: 1px solid #ddd;">USD Amount</th>
            </tr>
          </thead>
          <tbody>
            ${(wizardBudget.categories || []).map(cat => `
              <tr>
                <td style="padding: 6px; border: 1px solid #ddd;">
                  ${escapeHtmlAttr(cat.category || cat.name)} ${cat.subcategory ? `<span style="color: #666; font-size: 0.8rem;">(${escapeHtmlAttr(cat.subcategory)})</span>` : ''}
                </td>
                <td style="padding: 6px; border: 1px solid #ddd;">
                  ${Number(cat.localAmount || cat.local_amount || 0).toFixed(2)} ${escapeHtmlAttr(cat.currency || 'USD')}
                </td>
                <td style="padding: 6px; border: 1px solid #ddd; font-weight: bold;">
                  $${Number(cat.usdAmount || cat.usd_amount || 0).toFixed(2)}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        ${stepsHtml}
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
    const { data: freshBudget, error: freshErr } = await supabaseClient
      .from('budget_plans')
      .select('*')
      .eq('id', budgetId)
      .single();
    if (freshErr) throw freshErr;

    const teamId = freshBudget.team_id;
    const [openBudgetsRes, bucketsRes, userTeamsRes] = await Promise.all([
      supabaseClient
        .from('budget_plans')
        .select('id, name, status')
        .eq('team_id', teamId)
        .eq('is_deleted', false)
        .neq('id', freshBudget.id)
        .in('status', ['approved', 'received']),
      supabaseClient
        .from('buckets')
        .select('id, name, balance, currency')
        .eq('team_id', teamId)
        .eq('is_deleted', false),
      supabaseClient
        .from('user_teams')
        .select('user_id, access_level, users:user_id(id, name)')
        .eq('team_id', teamId)
    ]);

    const openBudgets = openBudgetsRes.data || [];
    const buckets = bucketsRes.data || [];
    const utMembers = userTeamsRes.data || [];

    wizardMembers = utMembers.map(m => ({
      id: m.user_id,
      name: m.users?.name || 'Unknown User',
      access_level: m.access_level
    }));

    if (wizardMembers.length === 0) {
      wizardMembers.push({
        id: state.user?.id,
        name: state.user?.name || 'Current User',
        access_level: 'opl'
      });
    }

    wizardBudget = freshBudget;
    wizardStep = 1;
    
    // Load pre-existing data from columns
    wizardData = {
      openBudgetsExplanation: freshBudget.open_budgets_explanation || [],
      cashBalance: freshBudget.recon_cash_balance || 0,
      bankBalance: freshBudget.recon_bank_balance || 0,
      remainingFunds: freshBudget.recon_remaining_funds || 0,
      allocations: freshBudget.submission_team_info?.allocations || {},
      housingInfo: freshBudget.submission_housing_info || {},
      accomplishmentsData: freshBudget.submission_accomplishments?.data || {},
      incomeData: freshBudget.submission_income_report?.data || {},
      socialMediaData: freshBudget.submission_social_media?.data || {},
      causingData: freshBudget.submission_coursing?.data || {},
      expensesClosed: !!freshBudget.submission_team_info?.expensesClosed,
      reconciliationConfirmed: !!freshBudget.submission_team_info?.reconciliationConfirmed || (freshBudget.recon_bank_balance > 0)
    };

    wizardOpenBudgets = openBudgets;
    wizardBuckets = buckets;

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

  const teamId = budget.team_id;
  const bucketsResult = await sbSelect('buckets', { teamId, orderBy: 'name', ascending: true });
  const activeBuckets = (bucketsResult.data || []).filter(b => !b.is_deleted);
  
  if (activeBuckets.length === 0) {
    showToast('No active buckets found for this team. Please create a bucket first.', 'warning');
    return;
  }

  const ratesResult = await sbSelect('exchange_rates', { teamId, orderBy: 'date', ascending: false });
  const exchangeRates = (ratesResult.data || []).filter(r => !r.is_deleted);

  const existing = document.getElementById('receiveFundsModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'receiveFundsModal';
  modal.className = 'modal active';
  modal.style.display = 'flex';

  const defaultAmount = budget.paid_amount || budget.total_amount || 0;

  const categoryOptions = (budget.categories || []).map(c => {
    const label = c.name || c.category || '';
    const sub = c.subcategory ? ` — ${c.subcategory}` : '';
    const fullLabel = `${label}${sub}`;
    return `<option value="${fullLabel}">${fullLabel}</option>`;
  }).join('');

  let bucketOptions = activeBuckets.map(b => `<option value="${b.id}">${b.name} (${b.currency || 'USD'})</option>`).join('');

  modal.innerHTML = `
    <div class="modal-content small" style="max-width: 480px; padding: 20px;">
      <h3>📥 Receive Funds & Allocate to Bucket</h3>
      <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 12px;">
        Allocate funds for budget: <strong>${budget.name}</strong> (Paid: $${defaultAmount.toFixed(2)} USD)
      </p>
      
      <div class="form-stack" style="display: flex; flex-direction: column; gap: 12px;">
        <div class="form-group">
          <label style="font-weight: 600; font-size: 0.85rem;">Select Bucket</label>
          <select id="recvBucketSelect" style="width: 100%;" required>
            ${bucketOptions}
          </select>
        </div>
        
        <div class="form-group">
          <label style="font-weight: 600; font-size: 0.85rem;">Amount to Receive (USD)</label>
          <input type="number" id="recvAmountUsd" step="0.01" value="${defaultAmount}" style="width: 100%;" required>
        </div>

        <div id="recvRateGroup" style="display: none; flex-direction: column; gap: 4px;">
          <div style="display: flex; gap: 10px;">
            <div class="form-group" style="flex: 1;">
              <label style="font-size: 0.75rem; color: var(--text-secondary);">Exchange Rate (1 USD = ?)</label>
              <input type="number" id="recvExchangeRate" step="any" style="width: 100%;">
            </div>
            <div class="form-group" style="flex: 1;">
              <label style="font-size: 0.75rem; color: var(--text-secondary);">Local Amount</label>
              <input type="number" id="recvLocalAmount" readonly style="width: 100%; background: #f3f4f6;">
            </div>
          </div>
        </div>

        <!-- Fee Auto-Log Section -->
        <div id="recvFeeSection" style="display: none; flex-direction: column; gap: 8px; border-top: 1px dashed var(--border); padding-top: 10px; margin-top: 6px;">
          <p style="margin: 0; font-size: 0.8rem; color: var(--danger); font-weight: 600;">
            ⚠️ Fee Detected: $<span id="recvFeeLabel">0.00</span> USD will be logged as transaction expense.
          </p>
          <div class="form-group">
            <label style="font-size: 0.75rem; color: var(--text-secondary);">Expense Category for Fee</label>
            <select id="recvFeeCategorySelect" style="width: 100%;">
              ${categoryOptions || '<option value="">(No categories on budget)</option>'}
            </select>
          </div>
        </div>
      </div>

      <div class="btn-group" style="margin-top: 18px; display: flex; justify-content: flex-end; gap: 8px;">
        <button type="button" class="secondary" onclick="document.getElementById('receiveFundsModal').remove()">Cancel</button>
        <button type="button" class="success" id="recvConfirmBtn">Confirm & Allocate</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const bucketSelect = modal.querySelector('#recvBucketSelect');
  const amountInput = modal.querySelector('#recvAmountUsd');
  const rateGroup = modal.querySelector('#recvRateGroup');
  const rateInput = modal.querySelector('#recvExchangeRate');
  const localInput = modal.querySelector('#recvLocalAmount');
  const feeSection = modal.querySelector('#recvFeeSection');
  const feeLabel = modal.querySelector('#recvFeeLabel');
  const feeCategorySelect = modal.querySelector('#recvFeeCategorySelect');
  const confirmBtn = modal.querySelector('#recvConfirmBtn');

  function updateMath() {
    const bucketId = bucketSelect.value;
    const bucket = activeBuckets.find(b => b.id === bucketId);
    const currency = bucket?.currency || 'USD';
    const amountUsd = parseFloat(amountInput.value) || 0;

    const diff = defaultAmount - amountUsd;
    if (diff > 0.009) {
      feeSection.style.display = 'flex';
      feeLabel.textContent = diff.toFixed(2);
    } else {
      feeSection.style.display = 'none';
    }

    if (currency === 'USD') {
      rateGroup.style.display = 'none';
      rateInput.value = '1';
      localInput.value = amountUsd.toFixed(2);
    } else {
      rateGroup.style.display = 'flex';
      if (!rateInput.value || rateInput.value === '1') {
        const rate = getLatestUsdRate(exchangeRates, currency) || 1;
        rateInput.value = rateForInput(rate);
      }
      const rate = parseFloat(rateInput.value) || 1;
      localInput.value = (amountUsd * rate).toFixed(2);
    }
  }

  bucketSelect.onchange = () => {
    rateInput.value = '';
    updateMath();
  };
  amountInput.oninput = updateMath;
  rateInput.oninput = updateMath;

  updateMath();

  confirmBtn.onclick = async () => {
    const bucketId = bucketSelect.value;
    const bucket = activeBuckets.find(b => b.id === bucketId);
    const amountUsd = parseFloat(amountInput.value) || 0;
    const rate = parseFloat(rateInput.value) || 1;
    const localAmount = parseFloat(localInput.value) || 0;

    if (amountUsd <= 0) {
      showToast('Amount must be greater than zero', 'warning');
      return;
    }
    if (amountUsd - defaultAmount > 0.01) {
      showToast(`Cannot receive more than the paid amount of $${defaultAmount.toFixed(2)} USD.`, 'warning');
      return;
    }

    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Allocating...';

    try {
      const diff = defaultAmount - amountUsd;
      if (diff > 0.009) {
        const feeCategory = feeCategorySelect.value;
        let matchedCategoryId = null;
        if (feeCategory) {
          const catResult = await sbSelect('categories', { teamId, orderBy: 'name' });
          const teamCategories = catResult.data || [];
          const match = teamCategories.find(tc => {
            const l = tc.name || '';
            return feeCategory.startsWith(l);
          });
          if (match) matchedCategoryId = match.id;
        }

        const expensePayload = {
          id: crypto.randomUUID(),
          team_id: teamId,
          date: new Date().toISOString().split('T')[0],
          item: 'Bank/Exchange Fee',
          description: `Auto-logged fee for budget funding mismatch (Paid: $${defaultAmount.toFixed(2)} USD vs Received: $${amountUsd.toFixed(2)} USD)`,
          budget_id: budget.id,
          bucket_id: bucketId,
          local_amount: roundUsd(diff * rate),
          currency: bucket.currency || 'USD',
          rate: rate,
          usd_amount: roundUsd(diff),
          total_usd: roundUsd(diff),
          status: 'recorded',
          payment_status: 'paid',
          balance_impact: false,
          created_by: state.user?.id,
          is_deleted: false,
          vendor_info: feeCategory ? `budget_cat:${feeCategory}` : '',
          category_id: matchedCategoryId,
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        };

        const expResult = await sbInsert('expenses', expensePayload);
        if (expResult?.error) throw expResult.error;
      }

      const incomePayload = {
        id: crypto.randomUUID(),
        team_id: teamId,
        date: new Date().toISOString().split('T')[0],
        payment_from: 'KMOF / Budget Funding',
        bucket_id: bucketId,
        payment_bucket: bucket.name,
        amount_usd: amountUsd,
        currency: bucket.currency || 'USD',
        exchange_rate: rate,
        local_amount: localAmount,
        description: `Received funding for budget: ${budget.name}`,
        budget_allocations: [{ budget_id: budget.id, amount_usd: amountUsd }],
        created_by: state.user?.id,
        is_deleted: false,
        updated_at: new Date().toISOString()
      };

      const incResult = await sbInsert('income', incomePayload);
      if (incResult?.error) throw incResult.error;

      const { error: updErr } = await supabaseClient
        .from('budget_plans')
        .update({ status: 'received' })
        .eq('id', budget.id);

      if (updErr) throw updErr;

      showToast('Funds received and allocated to bucket successfully!', 'success');
      modal.remove();
      await initViewBudgetsPage();
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Failed to allocate funds', 'error');
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Confirm & Allocate';
    }
  };
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
  const saveSubmitBtn = document.getElementById('saveEditBudgetSubmitBtn');

  setEditBudgetFormLocked(!linesEditable, budget);

  if (note) {
    if (linesEditable) {
      if (String(budget?.approval_status || '').toUpperCase() === 'CLARIFY-OPL') {
        note.textContent = 'ℹ️ This budget is open for clarification/revision. Save changes, then reply to the clarification in the Portal.';
        note.style.color = '#0056b3';
      } else {
        note.style.color = '#666';
        updateBudgetLineAmountHint();
      }
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
  if (saveSubmitBtn) {
    saveSubmitBtn.style.display = (canSubmitBudgetByStatus(budget) && linesEditable && !isSystemAdmin()) ? 'inline-block' : 'none';
  }

  document.getElementById('editBudgetModal').classList.add('active');
};

function setEditBudgetFormLocked(locked, budget) {
  const linesEditable = !locked;
  const nameInput = document.getElementById('editBudgetName');
  const currencyEl = document.getElementById('editBudgetCurrency');
  const rateEl = document.getElementById('editBudgetRate');
  const statusEl = document.getElementById('editBudgetStatus');

  if (nameInput) {
    nameInput.disabled = !linesEditable;
  }

  if (currencyEl) currencyEl.disabled = !linesEditable;
  if (rateEl) rateEl.disabled = !linesEditable;

  if (statusEl) {
    const canArchive = canArchiveBudget(budget);
    statusEl.disabled = !(linesEditable || canArchive || isSystemAdmin());
  }

  document.querySelectorAll('#editBudgetCategoriesContainer .category-row').forEach(row => {
    const localEl = row.querySelector('.budget-cat-local');
    const nameEl = row.querySelector('.budget-cat-name');
    const selectEl = row.querySelector('.budget-cat-category');
    const subSelectEl = row.querySelector('.budget-cat-subcategory');
    if (localEl) localEl.disabled = !linesEditable;
    if (nameEl) nameEl.disabled = !linesEditable;
    if (selectEl) selectEl.disabled = !linesEditable;
    if (subSelectEl) subSelectEl.disabled = !linesEditable;
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