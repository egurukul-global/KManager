// ==================== GENERATE RECEIPT PAGE ====================
import { state } from '../state.js';
import { sbInsert, sbUpdate, sbSoftDelete, sbSelect } from '../db.js';
import { showToast, showConfirm } from '../components/toasts.js';
import { btnIconEdit, btnIconDelete, cardRow } from '../utils/uiHelpers.js';
import { SUPPORTED_CURRENCIES } from '../utils/currency.js';
import {
  buildReceiptDataFromForm,
  calcReceiptItemTotal,
  calcReceiptTotals,
  collectReceiptItemsFromDom,
  nextReceiptNumber,
  receiptDataToDbPayload,
  receiptItemRowHtml,
  recordToReceiptData,
  renderReceiptHtml
} from '../utils/receiptHelpers.js';

let teamReceiptsCache = [];
let currentPreviewData = null;
let editingReceiptId = null;

function canViewAllReceipts() {
  return state.canViewAllExpenses;
}

function canEditReceipt(record) {
  if (!state.canManageExpenses) return false;
  if (canViewAllReceipts()) return true;
  return record.created_by === state.user?.id;
}

async function loadTeamReceipts() {
  const teamId = state.currentTeam?.team_id;
  if (!teamId) {
    teamReceiptsCache = [];
    return [];
  }
  const result = await sbSelect('expense_receipts', {
    teamId,
    orderBy: 'receipt_date',
    ascending: false
  });
  teamReceiptsCache = (result.data || []).filter(r => !r.is_deleted);
  if (!canViewAllReceipts()) {
    teamReceiptsCache = teamReceiptsCache.filter(r => r.created_by === state.user?.id);
  }
  return teamReceiptsCache;
}

function currencyOptionsHtml() {
  return SUPPORTED_CURRENCIES.map(c => `<option value="${c}">${c}</option>`).join('');
}

export function getGenerateReceiptPage() {
  if (!state.canManageExpenses) {
    return `
      <h1 class="page-title">Generate Receipt</h1>
      <div class="card"><h2>⛔ Access Denied</h2><p>You do not have permission to generate receipts.</p></div>
    `;
  }

  return `
    <h1 class="page-title">Generate Receipt</h1>

    <div class="card">
      <h2>🧾 Create Receipt</h2>
      <form id="receiptForm" onsubmit="window.previewReceipt(event)">
        <input type="hidden" id="editingReceiptId" value="">
        <div class="form-grid-row form-grid-row--receipt-meta">
          <div class="form-group"><label class="required">Date</label><input type="date" id="receiptDate" required></div>
          <div class="form-group"><label>Vendor Name</label><input type="text" id="receiptVendor" placeholder="e.g., Fresh Mart"></div>
          <div class="form-group"><label>Location</label><input type="text" id="receiptLocation" placeholder="e.g., Downtown Branch"></div>
          <div class="form-group"><label class="required">Local Currency</label><select id="receiptCurrency" required><option value="">—</option>${currencyOptionsHtml()}</select></div>
        </div>

        <h3 class="receipt-section-heading">Items</h3>
        <p class="receipt-section-note">Add at least one item. Qty and Rate are required.</p>
        <div id="receiptItemsContainer" class="alloc-line-cards">${receiptItemRowHtml(false)}</div>
        <div class="btn-group">
          <button type="button" class="secondary" onclick="window.addReceiptItemRow()">+ Add Item</button>
        </div>

        <div class="form-grid-row form-grid-row--receipt-totals">
          <div class="form-group"><label>Tax (%)</label><input type="number" id="receiptTax" step="0.01" value="0" oninput="window.recalcReceiptTotalsUi()"></div>
          <div class="form-group"><label>Discount</label><input type="number" id="receiptDiscount" step="0.01" value="0" oninput="window.recalcReceiptTotalsUi()"></div>
        </div>

        <div class="receipt-totals-panel budget-grand-total-card">
          <div class="data-card-row"><span class="data-card-row-label">Subtotal</span><span class="data-card-row-value" id="receiptSubtotalDisplay">0.00</span></div>
          <div class="data-card-row"><span class="data-card-row-label">Tax</span><span class="data-card-row-value" id="receiptTaxDisplay">0.00</span></div>
          <div class="data-card-row"><span class="data-card-row-label">Total</span><span class="data-card-row-value" id="receiptTotalDisplay">0.00</span></div>
          <div class="data-card-row"><span class="data-card-row-label">Discount</span><span class="data-card-row-value" id="receiptDiscountDisplay">0.00</span></div>
          <div class="data-card-row"><span class="data-card-row-label">Grand Total</span><span class="data-card-row-value" id="receiptGrandTotalDisplay">0.00</span></div>
        </div>

        <div class="btn-group">
          <button type="submit">Preview Receipt</button>
          <button type="button" class="secondary" onclick="window.clearReceiptForm()">Clear</button>
        </div>
      </form>
    </div>

    <div id="receiptPreviewArea" class="receipt-preview-area" style="display:none;">
      <div class="card">
        <h2>📄 Receipt Preview</h2>
        <div class="receipt-preview-container">
          <div id="receiptPreviewContent"></div>
        </div>
        <div class="receipt-actions">
          <button type="button" class="success" onclick="window.exportReceiptAsPng()">🖼️ Save as PNG</button>
          <button type="button" class="secondary" onclick="window.closeReceiptPreview()">Close Preview</button>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:16px;">
      <h2>📋 Saved Receipts</h2>
      <p id="receiptListScope" class="receipt-section-note"></p>
      <div class="filter-section">
        <div class="form-grid-row form-grid-row--receipt-filters">
          <div class="form-group"><label>From</label><input type="date" id="receiptFilterDateFrom" onchange="window.applyReceiptFilters()"></div>
          <div class="form-group"><label>To</label><input type="date" id="receiptFilterDateTo" onchange="window.applyReceiptFilters()"></div>
          <div class="form-group"><label>Receipt number</label><input type="text" id="receiptFilterNumber" placeholder="All" oninput="window.applyReceiptFilters()"></div>
          <div class="form-group"><label>Vendor</label><input type="text" id="receiptFilterVendor" placeholder="All" oninput="window.applyReceiptFilters()"></div>
          <div class="form-group form-group--filter-action">
            <label aria-hidden="true">&nbsp;</label>
            <button type="button" class="secondary" onclick="window.resetReceiptFilters()">Reset</button>
          </div>
        </div>
      </div>
      <p id="receiptFilterSummary" class="receipt-section-note" style="margin-top:12px;"></p>
      <div class="table-container show-desktop">
        <table>
          <thead>
            <tr>
              <th>Number</th><th>Date</th><th>Vendor</th><th>Currency</th><th>Grand Total</th><th>Actions</th>
            </tr>
          </thead>
          <tbody id="receiptListBody"></tbody>
        </table>
      </div>
      <div id="receiptMobileList" class="show-mobile data-card-list"></div>
      <div id="receiptListEmpty" class="empty-state" style="display:none;">No saved receipts yet. Use Save as PNG on a preview to save one.</div>
      <div id="receiptListNoMatch" class="empty-state" style="display:none;">No receipts match your filters.</div>
    </div>

    <div id="pngExportOverlay" class="png-export-overlay" aria-hidden="true">
      <div class="png-export-spinner">Generating PNG…</div>
    </div>
  `;
}

export async function initGenerateReceiptPage() {
  if (!state.canManageExpenses) return;

  editingReceiptId = null;
  currentPreviewData = null;

  const dateEl = document.getElementById('receiptDate');
  if (dateEl) dateEl.valueAsDate = new Date();

  bindReceiptItemHandlers();
  window.recalcReceiptTotalsUi();

  await loadTeamReceipts();
  renderReceiptList();

  const scopeEl = document.getElementById('receiptListScope');
  if (scopeEl) {
    scopeEl.textContent = canViewAllReceipts()
      ? 'Showing all team receipts.'
      : 'Showing your receipts only.';
  }
}

function bindReceiptItemHandlers() {
  const container = document.getElementById('receiptItemsContainer');
  if (!container) return;

  container.querySelectorAll('.rec-qty, .rec-rate').forEach(input => {
    input.addEventListener('input', (e) => {
      if (e.target.classList.contains('rec-rate') || e.target.classList.contains('rec-qty')) {
        recalcReceiptItemRow(e.target);
      }
    });
  });
}

function recalcReceiptItemRow(input) {
  const row = input.closest('.receipt-item-row');
  if (!row) return;
  const qty = parseFloat(row.querySelector('.rec-qty')?.value) || 0;
  const rate = parseFloat(row.querySelector('.rec-rate')?.value) || 0;
  const totalInput = row.querySelector('.rec-total');
  if (totalInput) totalInput.value = calcReceiptItemTotal(qty, rate).toFixed(2);
  window.recalcReceiptTotalsUi();
}

window.recalcReceiptTotalsUi = function() {
  const container = document.getElementById('receiptItemsContainer');
  const taxPercent = parseFloat(document.getElementById('receiptTax')?.value) || 0;
  const discount = parseFloat(document.getElementById('receiptDiscount')?.value) || 0;
  const currency = document.getElementById('receiptCurrency')?.value || '';
  const suffix = currency ? ` ${currency}` : '';

  const items = collectReceiptItemsFromDom(container);
  const { subtotal, taxAmount, total, grandTotal } = calcReceiptTotals(items, taxPercent, discount);

  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  set('receiptSubtotalDisplay', subtotal.toFixed(2) + suffix);
  set('receiptTaxDisplay', taxAmount.toFixed(2) + suffix + ` (${taxPercent.toFixed(2)}%)`);
  set('receiptTotalDisplay', total.toFixed(2) + suffix);
  set('receiptDiscountDisplay', discount.toFixed(2) + suffix);
  set('receiptGrandTotalDisplay', grandTotal.toFixed(2) + suffix);
};

window.addReceiptItemRow = function() {
  const container = document.getElementById('receiptItemsContainer');
  if (!container) return;
  container.insertAdjacentHTML('beforeend', receiptItemRowHtml(true));
  const row = container.lastElementChild;
  row.querySelector('.rec-rate')?.addEventListener('input', (e) => recalcReceiptItemRow(e.target));
  row.querySelector('.rec-qty')?.addEventListener('input', (e) => recalcReceiptItemRow(e.target));
};

window.removeReceiptItemRow = function(btn) {
  const container = document.getElementById('receiptItemsContainer');
  if (!container || container.children.length <= 1) {
    showToast('Receipt must have at least one item', 'error');
    return;
  }
  btn.closest('.receipt-item-row')?.remove();
  window.recalcReceiptTotalsUi();
}

window.clearReceiptForm = function() {
  document.getElementById('receiptForm')?.reset();
  editingReceiptId = null;
  currentPreviewData = null;
  document.getElementById('editingReceiptId').value = '';
  document.getElementById('receiptDate').valueAsDate = new Date();
  const container = document.getElementById('receiptItemsContainer');
  if (container) {
    container.innerHTML = receiptItemRowHtml(false);
    bindReceiptItemHandlers();
  }
  document.getElementById('receiptPreviewArea').style.display = 'none';
  window.recalcReceiptTotalsUi();
};

function validateReceiptFormData(data) {
  if (!data.date || !data.currency) {
    showToast('Date and currency are required', 'error');
    return false;
  }
  if (!data.items.length) {
    showToast('Please add at least one valid item', 'error');
    return false;
  }
  return true;
}

window.previewReceipt = function(e) {
  e.preventDefault();
  const form = document.getElementById('receiptForm');
  const existing = editingReceiptId
    ? teamReceiptsCache.find(r => r.id === editingReceiptId)
    : null;

  const data = buildReceiptDataFromForm(form, {
    receiptNumber: existing?.receipt_number || currentPreviewData?.receiptNumber || null,
    receiptHash: existing?.receipt_hash || currentPreviewData?.receiptHash || null
  });

  if (!validateReceiptFormData(data)) return;

  currentPreviewData = data;
  renderReceiptPreview(data);
};

function renderReceiptPreview(data) {
  const content = document.getElementById('receiptPreviewContent');
  const area = document.getElementById('receiptPreviewArea');
  if (!content || !area) return;
  content.innerHTML = renderReceiptHtml(data);
  area.style.display = 'block';
  area.scrollIntoView({ behavior: 'smooth' });
}

window.closeReceiptPreview = function() {
  const area = document.getElementById('receiptPreviewArea');
  if (area) area.style.display = 'none';
};

async function persistReceiptOnExport(data) {
  const teamId = state.currentTeam?.team_id;
  const userId = state.user?.id;
  if (!teamId || !userId) throw new Error('No team selected');

  const existing = editingReceiptId
    ? teamReceiptsCache.find(r => r.id === editingReceiptId)
    : null;

  if (!existing && !data.receiptNumber) {
    await loadTeamReceipts();
    data.receiptNumber = nextReceiptNumber(teamReceiptsCache);
    data.receiptHash = data.receiptNumber;
  } else if (existing) {
    data.receiptNumber = existing.receipt_number;
    data.receiptHash = existing.receipt_hash || existing.receipt_number;
  }

  const payload = receiptDataToDbPayload(data, teamId, userId, existing);

  let result;
  if (existing) {
    result = await sbUpdate('expense_receipts', payload, { id: existing.id });
  } else {
    result = await sbInsert('expense_receipts', payload);
  }

  if (result?.error) throw new Error(result.error.message);

  const saved = result.data?.[0] || payload;
  editingReceiptId = saved.id;
  document.getElementById('editingReceiptId').value = saved.id;
  currentPreviewData = recordToReceiptData(saved);

  await loadTeamReceipts();
  renderReceiptList();
  return saved;
}

function getFilteredReceipts() {
  const num = document.getElementById('receiptFilterNumber')?.value.trim().toLowerCase() || '';
  const vendor = document.getElementById('receiptFilterVendor')?.value.trim().toLowerCase() || '';
  const from = document.getElementById('receiptFilterDateFrom')?.value || '';
  const to = document.getElementById('receiptFilterDateTo')?.value || '';

  return teamReceiptsCache.filter(r => {
    if (num && !r.receipt_number.toLowerCase().includes(num)) return false;
    if (vendor && !(r.vendor || '').toLowerCase().includes(vendor)) return false;
    if (from && r.receipt_date < from) return false;
    if (to && r.receipt_date > to) return false;
    return true;
  });
}

window.applyReceiptFilters = function() {
  renderReceiptList();
};

window.resetReceiptFilters = function() {
  const num = document.getElementById('receiptFilterNumber');
  const vendor = document.getElementById('receiptFilterVendor');
  const from = document.getElementById('receiptFilterDateFrom');
  const to = document.getElementById('receiptFilterDateTo');
  if (num) num.value = '';
  if (vendor) vendor.value = '';
  if (from) from.value = '';
  if (to) to.value = '';
  renderReceiptList();
};

async function captureReceiptPng(data) {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-9999px;top:0;pointer-events:none;';
  host.innerHTML = renderReceiptHtml(data);
  document.body.appendChild(host);

  try {
    const target = host.querySelector('#generatedReceipt');
    if (!target) throw new Error('Receipt render failed');

    const html2canvas = (await import('html2canvas')).default;
    return await html2canvas(target, {
      scale: 2.5,
      backgroundColor: '#ffffff',
      allowTaint: false,
      useCORS: true,
      logging: false,
      width: target.scrollWidth,
      height: target.scrollHeight,
      onclone(clonedDoc) {
        const el = clonedDoc.getElementById('generatedReceipt');
        if (el) {
          el.style.border = '1.5px solid #222';
          el.style.borderRadius = '4px';
          el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)';
          el.style.padding = '22px 26px';
        }
      }
    });
  } finally {
    host.remove();
  }
}

function downloadPngCanvas(canvas, filename) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

/** Preview button: save to DB (new or edited) then download PNG. */
window.exportReceiptAsPng = async function() {
  if (!currentPreviewData) {
    showToast('Please generate a preview first', 'error');
    return;
  }

  const overlay = document.getElementById('pngExportOverlay');
  overlay?.classList.add('active');

  try {
    const form = document.getElementById('receiptForm');
    const fromForm = buildReceiptDataFromForm(form, {
      receiptNumber: currentPreviewData.receiptNumber,
      receiptHash: currentPreviewData.receiptHash
    });

    let latest;
    if (validateReceiptFormData(fromForm)) {
      latest = fromForm;
    } else if (currentPreviewData?.items?.length) {
      latest = { ...currentPreviewData };
    } else {
      showToast('Please generate a preview first', 'error');
      return;
    }

    currentPreviewData = latest;
    document.getElementById('receiptPreviewContent').innerHTML = renderReceiptHtml(latest);

    const saved = await persistReceiptOnExport(latest);
    showToast(`Receipt ${saved.receipt_number} saved`, 'success');

    const canvas = await captureReceiptPng(recordToReceiptData(saved));
    downloadPngCanvas(canvas, `${saved.receipt_number}_${saved.receipt_date}.png`);
  } catch (err) {
    console.error('PNG export error:', err);
    showToast(err.message || 'Failed to export PNG', 'error');
  } finally {
    overlay?.classList.remove('active');
  }
};

function renderReceiptList() {
  const tbody = document.getElementById('receiptListBody');
  const mobile = document.getElementById('receiptMobileList');
  const empty = document.getElementById('receiptListEmpty');
  const noMatch = document.getElementById('receiptListNoMatch');
  const summary = document.getElementById('receiptFilterSummary');
  if (!tbody) return;

  const filtered = getFilteredReceipts();

  if (summary) {
    summary.textContent = teamReceiptsCache.length
      ? `Showing ${filtered.length} of ${teamReceiptsCache.length} receipt(s).`
      : '';
  }

  if (!teamReceiptsCache.length) {
    tbody.innerHTML = '';
    if (mobile) mobile.innerHTML = '';
    if (empty) empty.style.display = 'block';
    if (noMatch) noMatch.style.display = 'none';
    return;
  }
  if (empty) empty.style.display = 'none';

  if (!filtered.length) {
    tbody.innerHTML = '';
    if (mobile) mobile.innerHTML = '';
    if (noMatch) noMatch.style.display = 'block';
    return;
  }
  if (noMatch) noMatch.style.display = 'none';

  tbody.innerHTML = filtered.map(r => {
    const editable = canEditReceipt(r);
    return `
      <tr>
        <td><strong>${r.receipt_number}</strong></td>
        <td>${r.receipt_date}</td>
        <td>${r.vendor || '—'}</td>
        <td>${r.currency}</td>
        <td>${parseFloat(r.grand_total).toFixed(2)}</td>
        <td>
          ${editable ? btnIconEdit(`window.editSavedReceipt('${r.id}')`) : ''}
          <button type="button" class="secondary small" onclick="window.previewSavedReceipt('${r.id}')">Preview</button>
          <button type="button" class="success small" title="Download PNG only (already saved)" onclick="window.exportSavedReceiptPng('${r.id}')">PNG</button>
          ${editable ? btnIconDelete(`window.deleteSavedReceipt('${r.id}')`) : ''}
        </td>
      </tr>
    `;
  }).join('');

  if (mobile) {
    mobile.innerHTML = filtered.map(r => {
      const editable = canEditReceipt(r);
      return `
        <article class="data-card data-card--compact">
          <div class="data-card-top">
            <span class="data-card-title">${r.receipt_number}</span>
            <span class="action-icon-group">
              ${editable ? btnIconEdit(`window.editSavedReceipt('${r.id}')`) : ''}
              ${editable ? btnIconDelete(`window.deleteSavedReceipt('${r.id}')`) : ''}
            </span>
          </div>
          ${cardRow('Date', r.receipt_date)}
          ${cardRow('Vendor', r.vendor || '—')}
          ${cardRow('Total', `${parseFloat(r.grand_total).toFixed(2)} ${r.currency}`)}
          <div class="data-card-actions">
            <button type="button" class="secondary small" onclick="window.previewSavedReceipt('${r.id}')">Preview</button>
            <button type="button" class="success small" onclick="window.exportSavedReceiptPng('${r.id}')">PNG</button>
          </div>
        </article>
      `;
    }).join('');
  }
}

window.editSavedReceipt = function(id) {
  const record = teamReceiptsCache.find(r => r.id === id);
  if (!record || !canEditReceipt(record)) return;

  editingReceiptId = id;
  document.getElementById('editingReceiptId').value = id;

  document.getElementById('receiptDate').value = record.receipt_date;
  document.getElementById('receiptVendor').value = record.vendor || '';
  document.getElementById('receiptLocation').value = record.location || '';
  document.getElementById('receiptCurrency').value = record.currency;
  document.getElementById('receiptTax').value = record.tax_percent || 0;
  document.getElementById('receiptDiscount').value = record.discount || 0;

  let items = record.items;
  if (typeof items === 'string') {
    try { items = JSON.parse(items); } catch { items = []; }
  }

  const container = document.getElementById('receiptItemsContainer');
  container.innerHTML = (items || []).map((item, idx) => receiptItemRowHtml(idx > 0)).join('') || receiptItemRowHtml(false);

  container.querySelectorAll('.receipt-item-row').forEach((row, idx) => {
    const item = items[idx];
    if (!item) return;
    row.querySelector('.rec-qty').value = item.qty;
    row.querySelector('.rec-unit').value = item.unit || 'unit';
    row.querySelector('.rec-item').value = item.item;
    row.querySelector('.rec-rate').value = item.rate;
    row.querySelector('.rec-total').value = item.total?.toFixed(2) ?? calcReceiptItemTotal(item.qty, item.rate).toFixed(2);
  });

  bindReceiptItemHandlers();
  window.recalcReceiptTotalsUi();
  currentPreviewData = recordToReceiptData(record);
  document.getElementById('receiptForm').scrollIntoView({ behavior: 'smooth' });
  showToast(`Editing ${record.receipt_number}`, 'info');
};

window.previewSavedReceipt = function(id) {
  const record = teamReceiptsCache.find(r => r.id === id);
  if (!record) return;
  currentPreviewData = recordToReceiptData(record);
  editingReceiptId = record.id;
  document.getElementById('editingReceiptId').value = record.id;
  renderReceiptPreview(currentPreviewData);
};

window.exportSavedReceiptPng = async function(id) {
  const record = teamReceiptsCache.find(r => r.id === id);
  if (!record) return;

  const overlay = document.getElementById('pngExportOverlay');
  overlay?.classList.add('active');

  try {
    const data = recordToReceiptData(record);
    const canvas = await captureReceiptPng(data);
    downloadPngCanvas(canvas, `${record.receipt_number}_${record.receipt_date}.png`);
    showToast('PNG downloaded', 'success');
  } catch (err) {
    console.error('PNG download error:', err);
    showToast(err.message || 'Failed to download PNG', 'error');
  } finally {
    overlay?.classList.remove('active');
  }
};

window.deleteSavedReceipt = async function(id) {
  const record = teamReceiptsCache.find(r => r.id === id);
  if (!record || !canEditReceipt(record)) return;
  showConfirm(`Delete receipt ${record.receipt_number}?`, async () => {
    try {
      const result = await sbSoftDelete('expense_receipts', id);
      if (result?.error) throw new Error(result.error.message);
      if (editingReceiptId === id) window.clearReceiptForm();
      showToast('Receipt deleted', 'success');
      await loadTeamReceipts();
      renderReceiptList();
    } catch (err) {
      showToast(err.message || 'Delete failed', 'error');
    }
  });
};
