/* ========== EXPENSES MODULE ========== */
import Cropper from 'cropperjs';
import 'cropperjs/dist/cropper.css';
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
import { getBudgetStatus, BUDGET_STATUS } from '../utils/budgetStatus.js';
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
import { btnIconEdit, btnIconDelete, cardRow } from '../utils/uiHelpers.js';
import { uploadReceipt, resolveReceiptViewUrl, extractReceiptObjectKey, isExternalReceiptUrl } from '../utils/upload.js';
import { scanAndParseReceipt } from '../utils/receipt-scanner.js';
import { openReceiptCameraScanner } from '../utils/receipt-camera-scanner.js';

let teamBucketsCache = [];
let teamBudgetsCache = [];
let teamCategoriesCache = [];
let exchangeRatesCache = [];
let teamExpensesCache = [];
let pendingExpensePayload = null;
let selectedExpenseIds = new Set();
let teamAttachmentsCache = [];
let stagedAttachments = [];

function canViewAllExpenses() {
  return state.canViewAllExpenses;
}

function canEditExpense(expense) {
  if (state.isReadOnlyTeamAccess) return false;
  if (!state.canManageExpenses) return false;
  if (expense.is_frozen) return false;

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

  const attachResult = await sbSelect('expense_attachments', { teamId });
  teamAttachmentsCache = (attachResult.data || []).filter(a => !a.is_deleted);

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
    const status = getBudgetStatus(b);
    if (currentOnly) {
      if (
        status !== BUDGET_STATUS.APPROVED &&
        status !== BUDGET_STATUS.RECEIVED &&
        status !== BUDGET_STATUS.PAID
      ) return;
    } else {
      if (
        status !== BUDGET_STATUS.APPROVED &&
        status !== BUDGET_STATUS.RECEIVED &&
        status !== BUDGET_STATUS.PAID &&
        status !== BUDGET_STATUS.ARCHIVED
      ) return;
    }
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
      const n = (c.name || c.category || '').toLowerCase();
      const target = categoryLabel.toLowerCase();
      const sub = (c.subcategory || '').toLowerCase();
      return n === target || `${n} — ${sub}` === target;
    })?.usdAmount ?? (budget?.categories || []).find(c => {
      const n = (c.name || c.category || '').toLowerCase();
      const target = categoryLabel.toLowerCase();
      const sub = (c.subcategory || '').toLowerCase();
      return n === target || `${n} — ${sub}` === target;
    })?.usd_amount ?? 0
  };

  if (budget && categoryLabel) {
    const lines = getBudgetCategoryOptions(budget, teamCategoriesCache);
    const match = lines.find(l => (l.label || '').toLowerCase() === categoryLabel.toLowerCase());
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
            <div class="form-group"><label class="required">Item</label><input type="text" name="item" id="expItem" required maxlength="20" placeholder="e.g. Groceries"></div>
            <div class="form-group"><label class="required">Local amount</label><input type="number" class="input-amount" name="local_amount" id="expLocalAmount" step="0.01" min="0" required oninput="window.onExpenseMathChange()"></div>
            <div class="form-group"><label>Currency</label><select name="currency" id="expCurrency" required onchange="window.onExpenseCurrencyChange()"><option value="">—</option></select></div>
          </div>
          <div class="form-grid-row form-grid-row--expense-money">
            <div class="form-group"><label>Rate (1 USD = ?)</label><select name="rate_select" id="expRateSelect" onchange="window.onExpenseMathChange()"><option value="">Rate</option></select></div>
            <div class="form-group"><label>Manual</label><input type="number" class="input-rate" name="rate_manual" id="expRateManual" step="any" placeholder="Rate" oninput="window.onExpenseMathChange()"></div>
            <div class="form-group"><label>USD</label><input type="number" class="input-amount" id="expUSD" step="0.01" readonly></div>
          </div>
          <div class="form-group form-span-full">
            <label>Receipt scanner</label>
            <div id="expReceiptDropzone" class="receipt-dropzone">
              <p><strong>Drop receipt image here</strong></p>
              <p class="form-hint">or use Scan / Choose file — we’ll read the text, fill fields, then upload</p>
              <div class="btn-group" style="margin-top:10px;flex-wrap:wrap;justify-content:center;">
                <button type="button" class="secondary" id="expReceiptCameraBtn">Scan with camera</button>
                <button type="button" class="secondary" id="expReceiptFileBtn">Choose file</button>
              </div>
              <input type="file" id="expReceiptFileInput" accept="image/*,application/pdf" multiple style="display:none">
            </div>
            <div id="expReceiptLocalPreview" style="margin-top:10px;"></div>
            <div id="expReceiptOcrProgress" class="receipt-ocr-progress" style="display:none;margin-top:10px;">
              <div class="receipt-ocr-progress-bar"><span id="expReceiptOcrBar"></span></div>
              <p class="form-hint" id="expReceiptOcrLabel">Reading receipt…</p>
            </div>
            <label for="expReceiptUrl" style="margin-top:12px;">Receipt file key / URL</label>
            <input type="text" name="receipt_url" id="expReceiptUrl" placeholder="Filled after upload (or paste an external URL)">
            <p class="form-hint" id="expReceiptHint" style="margin-top:6px;"></p>
            <div id="expReceiptPreview" style="margin-top:8px;"></div>
          </div>
          <div class="form-group form-span-full"><label for="expDescription">Notes</label><textarea name="description" id="expDescription" rows="2" placeholder="Optional notes"></textarea></div>
        </div>
        <div class="btn-group"><button type="submit">Confirm &amp; Save expense</button></div>
      </form>
    </div>
  `;
}

export async function initAddExpensePage() {
  if (!state.canManageExpenses) return;

  stagedAttachments = [];
  setTimeout(() => renderStagedAttachments('expReceiptPreview'), 50);

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

  wireReceiptUpload({
    urlInputId: 'expReceiptUrl',
    cameraBtnId: 'expReceiptCameraBtn',
    fileBtnId: 'expReceiptFileBtn',
    fileInputId: 'expReceiptFileInput',
    hintId: 'expReceiptHint',
    previewId: 'expReceiptPreview',
    localPreviewId: 'expReceiptLocalPreview',
    progressWrapId: 'expReceiptOcrProgress',
    progressBarId: 'expReceiptOcrBar',
    progressLabelId: 'expReceiptOcrLabel',
    dropzoneId: 'expReceiptDropzone',
    enableOcr: true,
    useJscanifyCamera: false,
    fillForm: {
      itemId: 'expItem',
      dateId: 'expDate',
      amountId: 'expLocalAmount',
      notesId: 'expDescription',
      onAmountFilled: () => window.onExpenseMathChange?.()
    }
  });
}

/** Camera (jscanify) / file / drop → optional OCR → R2 upload → store objectKey */
function wireReceiptUpload({
  urlInputId,
  cameraBtnId,
  fileBtnId,
  cameraInputId,
  fileInputId,
  hintId,
  previewId,
  localPreviewId,
  progressWrapId,
  progressBarId,
  progressLabelId,
  dropzoneId,
  enableOcr = false,
  useJscanifyCamera = false,
  fillForm = null
}) {
  const urlInput = document.getElementById(urlInputId);
  const cameraBtn = document.getElementById(cameraBtnId);
  const fileBtn = document.getElementById(fileBtnId);
  const cameraInput = cameraInputId ? document.getElementById(cameraInputId) : null;
  const fileInput = document.getElementById(fileInputId);
  const hint = document.getElementById(hintId);
  const preview = previewId ? document.getElementById(previewId) : null;
  const localPreview = localPreviewId ? document.getElementById(localPreviewId) : null;
  const progressWrap = progressWrapId ? document.getElementById(progressWrapId) : null;
  const progressBar = progressBarId ? document.getElementById(progressBarId) : null;
  const progressLabel = progressLabelId ? document.getElementById(progressLabelId) : null;
  const dropzone = dropzoneId ? document.getElementById(dropzoneId) : null;
  if (!urlInput || !fileBtn || !fileInput) return;
  if (!cameraBtn && !useJscanifyCamera) return;

  urlInput.oninput = () => {
    const val = urlInput.value.trim();
    if (val) {
      stagedAttachments.push({ id: crypto.randomUUID(), file_url: val, unsaved: true });
      urlInput.value = '';
      if (hint) hint.textContent = 'Link added to receipts';
      if (previewId) renderStagedAttachments(previewId);
    }
  };

  const setBusy = (busy, phase = '') => {
    if (cameraBtn) {
      cameraBtn.disabled = busy;
      cameraBtn.textContent = busy ? (phase || 'Working…') : 'Scan with camera';
    }
    fileBtn.disabled = busy;
    fileBtn.textContent = busy ? (phase || 'Working…') : 'Choose file';

    const parentForm = urlInput.closest('form');
    const submitBtn = parentForm?.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = busy;
      if (busy) {
        if (!submitBtn.dataset.originalText) {
          submitBtn.dataset.originalText = submitBtn.textContent;
        }
        submitBtn.textContent = 'Uploading Receipt…';
      } else if (submitBtn.dataset.originalText) {
        submitBtn.textContent = submitBtn.dataset.originalText;
      }
    }
  };

  const showLocalPreview = (file) => {
    if (!localPreview) return;
    if (!file || !file.type?.startsWith('image/')) {
      localPreview.innerHTML = file ? `<p class="form-hint">${file.name}</p>` : '';
      return;
    }
    const url = URL.createObjectURL(file);
    localPreview.innerHTML = `<img src="${url}" alt="Receipt preview" class="receipt-local-preview-img">`;
  };

  const setOcrProgress = (show, pct = 0, label = '') => {
    if (!progressWrap) return;
    progressWrap.style.display = show ? '' : 'none';
    if (progressBar) progressBar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    if (progressLabel) progressLabel.textContent = label || 'Reading receipt…';
  };

  const applyOcrFields = (parsed) => {
    if (!fillForm || !parsed) return;
    const itemEl = fillForm.itemId ? document.getElementById(fillForm.itemId) : null;
    const dateEl = fillForm.dateId ? document.getElementById(fillForm.dateId) : null;
    const amountEl = fillForm.amountId ? document.getElementById(fillForm.amountId) : null;
    const notesEl = fillForm.notesId ? document.getElementById(fillForm.notesId) : null;

    if (itemEl && parsed.merchant) itemEl.value = String(parsed.merchant).slice(0, 20);
    if (dateEl && parsed.date) dateEl.value = parsed.date;
    if (amountEl && parsed.total != null) {
      amountEl.value = parsed.total;
      fillForm.onAmountFilled?.();
    }
    if (notesEl && parsed.rawText && !notesEl.value.trim()) {
      notesEl.value = `OCR: ${parsed.rawText.slice(0, 280)}`;
    }
  };

  const openCropModal = (file, onCropAndUpload) => {
    const existing = document.getElementById('receipt-crop-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'receipt-crop-modal';
    modal.className = 'modal active';
    modal.innerHTML = `
      <div class="modal-content receipt-crop-modal-content">
        <h3>Crop Receipt</h3>
        <div class="receipt-crop-container">
          <img id="receipt-crop-image" src="" alt="Receipt to crop">
        </div>
        <div class="receipt-crop-actions">
          <button type="button" class="btn btn-secondary" id="receipt-crop-cancel">Cancel</button>
          <button type="button" class="btn btn-secondary" id="receipt-crop-rotate">Rotate</button>
          <button type="button" class="btn btn-primary" id="receipt-crop-upload">
            <span class="spinner-inline" id="receipt-crop-spinner" style="display: none;"></span>
            <span id="receipt-crop-upload-text">Crop & Upload</span>
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const imageEl = modal.querySelector('#receipt-crop-image');
    const cancelBtn = modal.querySelector('#receipt-crop-cancel');
    const rotateBtn = modal.querySelector('#receipt-crop-rotate');
    const uploadBtn = modal.querySelector('#receipt-crop-upload');
    const spinner = modal.querySelector('#receipt-crop-spinner');
    const uploadText = modal.querySelector('#receipt-crop-upload-text');

    const fileUrl = URL.createObjectURL(file);
    imageEl.src = fileUrl;

    let cropper;
    imageEl.onload = () => {
      cropper = new Cropper(imageEl, {
        aspectRatio: NaN,
        viewMode: 1,
        autoCropArea: 1,
        responsive: true,
        restore: false,
        checkCrossOrigin: false,
      });
    };

    cancelBtn.onclick = () => {
      if (cropper) cropper.destroy();
      URL.revokeObjectURL(fileUrl);
      modal.remove();
      if (cameraInput) cameraInput.value = '';
      fileInput.value = '';
      const tempInput = document.getElementById('temp-native-camera-input');
      if (tempInput) tempInput.value = '';
    };

    rotateBtn.onclick = () => {
      if (cropper) cropper.rotate(90);
    };

    uploadBtn.onclick = () => {
      if (!cropper) return;

      cancelBtn.disabled = true;
      rotateBtn.disabled = true;
      uploadBtn.disabled = true;
      spinner.style.display = 'inline-block';
      uploadText.textContent = 'Uploading...';

      cropper.getCroppedCanvas({
        maxWidth: 2048,
        maxHeight: 2048,
        imageSmoothingHigh: true
      }).toBlob(async (blob) => {
        if (!blob) {
          showToast('Could not crop image', 'error');
          cancelBtn.disabled = false;
          rotateBtn.disabled = false;
          uploadBtn.disabled = false;
          spinner.style.display = 'none';
          uploadText.textContent = 'Crop & Upload';
          return;
        }

        let name = file.name || 'receipt.jpg';
        const dotIdx = name.lastIndexOf('.');
        if (dotIdx >= 0) {
          name = name.substring(0, dotIdx) + '.jpg';
        } else {
          name = name + '.jpg';
        }

        const croppedFile = new File([blob], name, {
          type: 'image/jpeg',
          lastModified: Date.now()
        });
        croppedFile.isCropped = true;

        try {
          await onCropAndUpload(croppedFile);
          if (cropper) cropper.destroy();
          URL.revokeObjectURL(fileUrl);
          modal.remove();
        } catch (err) {
          showToast(err.message || 'Upload failed', 'error');
          cancelBtn.disabled = false;
          rotateBtn.disabled = false;
          uploadBtn.disabled = false;
          spinner.style.display = 'none';
          uploadText.textContent = 'Crop & Upload';
        }
      }, 'image/jpeg', 0.9);
    };
  };

  const runPipeline = async (file) => {
    if (!file) return;

    const isImage = file.type?.startsWith('image/');
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');

    if (isImage && !isPdf && !file.isCropped && !file.skipCrop) {
      const choiceModal = document.createElement('div');
      choiceModal.className = 'modal active';
      choiceModal.style.zIndex = 10000;
      choiceModal.innerHTML = `
        <div class="modal-content small" style="text-align: center; max-width: 400px; padding: 24px;">
          <h3 style="margin-bottom: 12px;">🖼️ Upload Receipt Image</h3>
          <p style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 20px;">
            Would you like to crop the receipt before uploading?
          </p>
          <div class="btn-stack" style="display: flex; flex-direction: column; gap: 8px;">
            <button type="button" class="primary" id="btnChoiceCrop">Crop & Upload</button>
            <button type="button" class="success" id="btnChoiceDirect">Direct Upload (As-is)</button>
            <button type="button" class="secondary" id="btnChoiceCancel">Cancel</button>
          </div>
        </div>
      `;
      document.body.appendChild(choiceModal);

      choiceModal.querySelector('#btnChoiceCrop').onclick = () => {
        choiceModal.remove();
        openCropModal(file, async (croppedFile) => {
          await runPipeline(croppedFile);
        });
      };

      choiceModal.querySelector('#btnChoiceDirect').onclick = () => {
        choiceModal.remove();
        file.skipCrop = true;
        runPipeline(file);
      };

      choiceModal.querySelector('#btnChoiceCancel').onclick = () => {
        choiceModal.remove();
        if (fileInput) fileInput.value = '';
        const editFileInput = document.getElementById('editExpReceiptFileInput');
        if (editFileInput) editFileInput.value = '';
      };
      return;
    }

    showLocalPreview(file);
    setBusy(true, 'Reading…');
    setOcrProgress(false);

    try {
      if (enableOcr && isImage && !isPdf) {
        setOcrProgress(true, 0, 'Starting OCR…');
        try {
          const parsed = await scanAndParseReceipt(file, (pct, status) => {
            setOcrProgress(true, pct, status === 'recognizing text' ? `Reading text… ${pct}%` : `Preparing… ${pct}%`);
            setBusy(true, `OCR ${pct}%`);
          });
          applyOcrFields(parsed);
          if (parsed.ocrFailed || parsed.lowConfidence) {
            showToast(parsed.warning || 'Please check the filled fields', 'warning');
            if (hint) hint.textContent = parsed.warning || 'Check Item / Date / Amount';
          } else if (hint) {
            hint.textContent = 'Fields filled from receipt — review, then save.';
          }
        } catch (ocrErr) {
          console.warn('OCR failed:', ocrErr);
          showToast('Could not read receipt text. Enter details manually — still uploading image.', 'warning');
          if (hint) hint.textContent = 'OCR failed — fill fields manually.';
        }
        setOcrProgress(false);
      } else if (enableOcr && isPdf) {
        showToast('PDF saved as receipt — OCR works best with photos.', 'info');
      }

      setBusy(true, 'Uploading…');
      if (hint && !hint.textContent) hint.textContent = 'Uploading receipt…';
      const { objectKey } = await uploadReceipt(file);
      stagedAttachments.push({ id: crypto.randomUUID(), file_url: objectKey, unsaved: true });
      if (hint) hint.textContent = `Saved: ${objectKey}`;
      if (previewId) await renderStagedAttachments(previewId);
      showToast('Receipt uploaded', 'success');
    } catch (err) {
      showToast(err.message || 'Upload failed', 'error');
      throw err;
    } finally {
      setBusy(false);
      setOcrProgress(false);
      if (cameraInput) cameraInput.value = '';
      fileInput.value = '';
      const tempInput = document.getElementById('temp-native-camera-input');
      if (tempInput) tempInput.value = '';
    }
  };


  if (cameraBtn) {
    cameraBtn.onclick = async () => {
      if (useJscanifyCamera) {
        setBusy(true, 'Opening camera…');
        try {
          const file = await openReceiptCameraScanner();
          if (file) await runPipeline(file);
        } catch (err) {
          showToast(err.message || 'Camera scanner failed', 'error');
        } finally {
          setBusy(false);
        }
        return;
      }
      if (cameraInput) {
        cameraInput.click();
      } else {
        let tempInput = document.getElementById('temp-native-camera-input');
        if (!tempInput) {
          tempInput = document.createElement('input');
          tempInput.id = 'temp-native-camera-input';
          tempInput.type = 'file';
          tempInput.accept = 'image/*';
          tempInput.capture = 'environment';
          tempInput.style.display = 'none';
          tempInput.onchange = () => {
            if (tempInput.files?.[0]) runPipeline(tempInput.files[0]);
          };
          document.body.appendChild(tempInput);
        }
        tempInput.click();
      }
    };
  }

  fileBtn.onclick = () => fileInput.click();
  if (cameraInput) cameraInput.onchange = () => runPipeline(cameraInput.files?.[0]);
  fileInput.onchange = () => {
    if (fileInput.files) {
      for (const file of fileInput.files) {
        runPipeline(file);
      }
    }
  };

  if (dropzone) {
    const prevent = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev => {
      dropzone.addEventListener(ev, prevent);
    });
    dropzone.addEventListener('dragover', () => dropzone.classList.add('receipt-dropzone--active'));
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('receipt-dropzone--active'));
    dropzone.addEventListener('drop', (e) => {
      dropzone.classList.remove('receipt-dropzone--active');
      if (e.dataTransfer?.files) {
        for (const file of e.dataTransfer.files) {
          runPipeline(file);
        }
      }
    });
  }
}

function normalizeExpenseReceiptField(payload) {
  if (!payload?.receipt_url) return;
  const raw = String(payload.receipt_url).trim();
  if (!raw) {
    payload.receipt_url = null;
    return;
  }
  if (isExternalReceiptUrl(raw)) {
    payload.receipt_url = raw;
    return;
  }
  payload.receipt_url = extractReceiptObjectKey(raw) || raw;
}

async function showReceiptPreview(container, stored) {
  if (!container) return;
  if (!stored) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = '<p class="form-hint">Loading preview…</p>';
  try {
    let content = '';
    if (isExternalReceiptUrl(stored)) {
      content = `<a href="${stored}" target="_blank" rel="noopener">Open receipt</a>`;
    } else {
      const viewUrl = await resolveReceiptViewUrl(stored);
      const key = extractReceiptObjectKey(stored);
      const isPdf = /\.pdf($|\?)/i.test(key) || /\.pdf($|\?)/i.test(viewUrl);
      if (isPdf) {
        content = `<a href="${viewUrl}" target="_blank" rel="noopener">Open PDF receipt</a>`;
      } else {
        content = `<a href="${viewUrl}" target="_blank" rel="noopener"><img src="${viewUrl}" alt="Receipt" style="max-width:220px;max-height:160px;border-radius:6px;border:1px solid var(--border);"></a>`;
      }
    }

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 8px; margin-top: 8px;">
        ${content}
        <button type="button" class="danger btn-xs" style="padding: 4px 8px; font-size: 0.75rem; border: none; border-radius: 4px; cursor: pointer; color: white;" id="btnRemoveReceipt-${container.id}">❌ Remove Receipt</button>
      </div>
    `;

    container.querySelector(`#btnRemoveReceipt-${container.id}`).onclick = (e) => {
      e.preventDefault();
      const isEdit = container.id.toLowerCase().includes('edit');
      const urlInputId = isEdit ? 'editExpReceiptUrl' : 'expReceiptUrl';
      const hintId = isEdit ? 'editExpReceiptHint' : 'expReceiptHint';

      const urlInput = document.getElementById(urlInputId);
      const hint = document.getElementById(hintId);

      if (urlInput) urlInput.value = '';
      if (hint) hint.textContent = 'Receipt removed';
      container.innerHTML = '';
    };
  } catch (err) {
    container.innerHTML = `<p class="form-hint" style="color:#dc3545;">${err.message || 'Could not load receipt'}</p>`;
  }
}

async function renderStagedAttachments(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!stagedAttachments.length) {
    container.innerHTML = '<p class="form-hint">No files uploaded yet.</p>';
    return;
  }

  const htmls = await Promise.all(stagedAttachments.map(async (attach, idx) => {
    let previewHtml = '';
    const key = attach.file_url;
    if (isExternalReceiptUrl(key)) {
      previewHtml = `<a href="${key}" target="_blank" rel="noopener">Receipt Link ${idx + 1}</a>`;
    } else {
      try {
        const viewUrl = await resolveReceiptViewUrl(key);
        const objKey = extractReceiptObjectKey(key);
        const isPdf = /\.pdf($|\?)/i.test(objKey) || /\.pdf($|\?)/i.test(viewUrl);
        if (isPdf) {
          previewHtml = `<a href="${viewUrl}" target="_blank" rel="noopener">📄 PDF Receipt ${idx + 1}</a>`;
        } else {
          previewHtml = `<a href="${viewUrl}" target="_blank" rel="noopener"><img src="${viewUrl}" alt="Receipt" style="max-width:100px;max-height:80px;border-radius:4px;border:1px solid var(--border);"></a>`;
        }
      } catch {
        previewHtml = `<span style="color:var(--danger);">Error loading file</span>`;
      }
    }

    return `
      <div class="attachment-preview-card" style="display:flex;flex-direction:column;align-items:center;border:1px solid var(--border);border-radius:6px;padding:8px;position:relative;background:var(--bg-card);gap:6px;min-width:110px;">
        ${previewHtml}
        <button type="button" class="danger btn-xs" style="padding:2px 6px;font-size:0.7rem;margin-top:2px;border:none;border-radius:4px;color:white;cursor:pointer;" onclick="window.removeStagedAttachment('${containerId}', '${attach.id}')">❌ Remove</button>
      </div>
    `;
  }));

  container.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:10px;">
      ${htmls.join('')}
    </div>
  `;
}

window.removeStagedAttachment = function(containerId, attachId) {
  stagedAttachments = stagedAttachments.filter(a => a.id !== attachId);
  renderStagedAttachments(containerId);
};

async function saveExpenseAttachments(expenseId) {
  const teamId = state.currentTeam.team_id;
  const now = new Date().toISOString();

  // 1. Fetch existing active attachments in DB for this expense
  const dbAttachResult = await sbSelect('expense_attachments', { teamId });
  const dbAttach = (dbAttachResult.data || []).filter(a => !a.is_deleted && a.expense_id === expenseId);

  // 2. Identify attachments to delete (in DB but not in stagedAttachments)
  const stagedIds = new Set(stagedAttachments.map(a => a.id));
  for (const a of dbAttach) {
    if (!stagedIds.has(a.id)) {
      await sbUpdate('expense_attachments', { is_deleted: true, deleted_at: now, updated_at: now }, { id: a.id });
    }
  }

  // 3. Insert new attachments
  for (const a of stagedAttachments) {
    const exists = dbAttach.some(db => db.id === a.id);
    if (!exists) {
      await sbInsert('expense_attachments', {
        id: a.id,
        team_id: teamId,
        expense_id: expenseId,
        file_url: a.file_url,
        created_by: state.user.id,
        is_deleted: false,
        updated_at: now
      });
    }
  }
}

function receiptCellHtml(exp) {
  const keys = [exp.receipt_url].filter(Boolean);
  const childAttachments = (teamAttachmentsCache || []).filter(a => a.expense_id === exp.id && !a.is_deleted).map(a => a.file_url);
  const allKeys = [...new Set([...keys, ...childAttachments])];
  if (!allKeys.length) return '—';
  const id = `receipt-${exp.id}`;
  return `<span class="receipt-cell" data-receipt-stored="${String(allKeys.join(',')).replace(/"/g, '&quot;')}" id="${id}">…</span>`;
}

async function hydrateReceiptCells() {
  const cells = document.querySelectorAll('.receipt-cell[data-receipt-stored]');
  await Promise.all([...cells].map(async (el) => {
    const storedStr = el.getAttribute('data-receipt-stored') || '';
    const storedKeys = storedStr.split(',').filter(Boolean);
    if (!storedKeys.length) {
      el.textContent = '—';
      return;
    }
    
    try {
      const linksHtmls = await Promise.all(storedKeys.map(async (key, idx) => {
        try {
          if (isExternalReceiptUrl(key)) {
            return `<a href="${key}" target="_blank" rel="noopener" style="font-size: 1.1rem; text-decoration: none;">📎</a>`;
          }
          const viewUrl = await resolveReceiptViewUrl(key);
          const objKey = extractReceiptObjectKey(key);
          const isPdf = /\.pdf($|\?)/i.test(objKey) || /\.pdf($|\?)/i.test(viewUrl);
          if (isPdf) {
            return `<a href="${viewUrl}" target="_blank" rel="noopener" style="text-decoration: none; font-size: 0.8rem; font-weight: bold; color: var(--primary);">📎 PDF</a>`;
          } else {
            return `<a href="${viewUrl}" target="_blank" rel="noopener" title="Open receipt"><img src="${viewUrl}" alt="Receipt" style="width:30px;height:30px;object-fit:cover;border-radius:4px;vertical-align:middle;margin-right:2px;border:1px solid var(--border);"></a>`;
          }
        } catch {
          return '<span title="Could not load">📎</span>';
        }
      }));
      el.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;">${linksHtmls.join('')}</div>`;
    } catch {
      el.innerHTML = '—';
    }
  }));
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
  normalizeExpenseReceiptField(payload);
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;

  validateAndWarnExpense(payload, null, async () => {
    try {
      await saveExpenseRecord(payload, false);
      await saveExpenseAttachments(payload.id);
      showToast('Expense added', 'success');
      form.reset();
      document.getElementById('expDate').valueAsDate = new Date();
      applyExpenseDefaults();
      stagedAttachments = [];
      const expReceiptHint = document.getElementById('expReceiptHint');
      const expReceiptPreview = document.getElementById('expReceiptPreview');
      if (expReceiptHint) expReceiptHint.textContent = '';
      if (expReceiptPreview) expReceiptPreview.innerHTML = '';
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
  if (!state.canManageExpenses && !state.canViewAllExpenses) {
    return `
      <h1 class="page-title">Expense Manager</h1>
      <div class="card"><h2>⛔ Access Denied</h2><p>You do not have permission to view expenses.</p></div>
    `;
  }

  const scopeNote = state.isReadOnlyTeamAccess
    ? 'Read-only view — all team expenses.'
    : canViewAllExpenses()
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
      ${state.canManageExpenses ? `
      <div class="bulk-actions show-desktop" id="expBulkActions">
        <span id="expSelectedCount">0 selected</span>
        <button type="button" class="info" id="expEditSelectedBtn" disabled onclick="window.editSelectedExpense()">Edit selected</button>
        <button type="button" class="danger" onclick="window.deleteSelectedExpenses()">Delete selected</button>
        <button type="button" class="secondary" onclick="window.clearExpenseSelection()">Clear</button>
      </div>
      ` : ''}
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
              <div class="form-group"><label class="required">Item</label><input type="text" name="item" id="editExpItem" required maxlength="20"></div>
              <div class="form-group"><label class="required">Local amount</label><input type="number" class="input-amount" name="local_amount" id="editExpLocalAmount" step="0.01" required oninput="window.onEditExpenseMathChange()"></div>
              <div class="form-group"><label class="required">Currency</label><select id="editExpCurrency" name="currency" required onchange="window.onEditExpenseCurrencyChange()"></select></div>
            </div>
            <div class="form-grid-row form-grid-row--expense-money">
              <div class="form-group"><label>Rate</label><select id="editExpRateSelect" name="rate_select" onchange="window.onEditExpenseMathChange()"></select></div>
              <div class="form-group"><label>Manual</label><input type="number" class="input-rate" id="editExpRateManual" name="rate_manual" step="any" oninput="window.onEditExpenseMathChange()"></div>
              <div class="form-group"><label>USD</label><input type="number" class="input-amount" id="editExpUSD" readonly></div>
            </div>
            <div class="form-group form-span-full">
              <label>Receipt</label>
              <input type="text" id="editExpReceiptUrl" name="receipt_url" placeholder="Paste URL, or scan / upload (stores file key)">
              <div class="btn-group" style="margin-top:8px;flex-wrap:wrap;">
                <button type="button" class="secondary" id="editExpReceiptCameraBtn">Scan with camera</button>
                <button type="button" class="secondary" id="editExpReceiptFileBtn">Choose file</button>
                <input type="file" id="editExpReceiptFileInput" accept="image/*,application/pdf" multiple style="display:none">
              </div>
              <p class="form-hint" id="editExpReceiptHint" style="margin-top:6px;"></p>
              <div id="editExpReceiptPreview" style="margin-top:8px;"></div>
            </div>
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
  if (!state.canManageExpenses && !state.canViewAllExpenses) return;

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

  wireReceiptUpload({
    urlInputId: 'editExpReceiptUrl',
    cameraBtnId: 'editExpReceiptCameraBtn',
    fileBtnId: 'editExpReceiptFileBtn',
    fileInputId: 'editExpReceiptFileInput',
    hintId: 'editExpReceiptHint',
    previewId: 'editExpReceiptPreview',
    useJscanifyCamera: false,
    enableOcr: true,
    fillForm: {
      itemId: 'editExpItem',
      dateId: 'editExpDate',
      amountId: 'editExpLocalAmount',
      notesId: 'editExpDescription',
      onAmountFilled: () => window.onEditExpenseMathChange?.()
    }
  });

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
    const receipt = receiptCellHtml(exp);
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
          ${canEdit ? `${btnIconEdit(`window.editExpense('${exp.id}')`)}${btnIconDelete(`window.deleteExpense('${exp.id}')`)}` : '<span style="color:#999;font-size:0.8em;">View only</span>'}
        </td>
      </tr>`;

    mobileHtml += `
      <article class="data-card data-card--compact">
        <div class="data-card-top">
          <span class="data-card-title">${exp.item}</span>
          <span class="action-icon-group">
            ${canEdit ? `${btnIconEdit(`window.editExpense('${exp.id}')`)}${btnIconDelete(`window.deleteExpense('${exp.id}')`)}` : ''}
          </span>
        </div>
        ${cardRow('Date', exp.date)}
        ${cardRow('Budget', budget?.name || '—')}
        ${cardRow('Category', catLabel)}
        ${cardRow('Bucket', bucket?.name || '—')}
        ${cardRow('Local', `${(exp.local_amount || 0).toLocaleString()} ${exp.currency || ''}`)}
        ${cardRow('USD', `$${(exp.usd_amount || 0).toFixed(2)}`, 'data-card-row-value')}
        ${cardRow('Receipt', receipt)}
      </article>`;
  });

  if (tbody) tbody.innerHTML = tableHtml;
  if (mobile) mobile.innerHTML = mobileHtml;
  updateExpenseSelectionUi();
  hydrateReceiptCells();
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
  
  const keys = [exp.receipt_url].filter(Boolean);
  const childAttachments = (teamAttachmentsCache || []).filter(a => a.expense_id === id && !a.is_deleted).map(a => a.file_url);
  const allKeys = [...new Set([...keys, ...childAttachments])];
  
  stagedAttachments = allKeys.map(key => {
    const dbItem = (teamAttachmentsCache || []).find(a => a.expense_id === id && a.file_url === key);
    return {
      id: dbItem?.id || crypto.randomUUID(),
      file_url: key,
      unsaved: false
    };
  });
  
  renderStagedAttachments('editExpReceiptPreview');

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
  const editHint = document.getElementById('editExpReceiptHint');
  const editPreview = document.getElementById('editExpReceiptPreview');
  if (editHint) editHint.textContent = '';
  if (editPreview) editPreview.innerHTML = '';
}

async function handleEditExpenseSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('editExpId').value;
  const existing = teamExpensesCache.find(x => x.id === id);
  if (!existing || !canEditExpense(existing)) return;

  const form = document.getElementById('editExpenseForm');
  form._rates = exchangeRatesCache;

  const payload = buildExpensePayload(form, state.currentTeam.team_id, existing.created_by);
  normalizeExpenseReceiptField(payload);
  payload.updated_at = new Date().toISOString();

  validateAndWarnExpense(payload, id, async () => {
    try {
      await saveExpenseRecord(payload, true, id);
      await saveExpenseAttachments(id);
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
      const result = await sbSoftDelete('expenses', id);
      if (result && result.error) throw result.error;
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
    let successCount = 0;
    let errors = [];
    for (const id of ids) {
      try {
        const result = await sbSoftDelete('expenses', id);
        if (result && result.error) throw result.error;
        selectedExpenseIds.delete(id);
        successCount++;
      } catch (err) {
        errors.push(err.message || 'Delete failed');
      }
    }
    await loadTeamExpenses();
    if (successCount > 0) {
      showToast(`${successCount} expense(s) deleted`, 'success');
    }
    if (errors.length > 0) {
      showToast(`Failed to delete some expenses: ${errors[0]}`, 'error');
    }
    refreshExpenseList();
  });
}
