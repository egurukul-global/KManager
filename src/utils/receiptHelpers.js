// ==================== EXPENSE RECEIPT HELPERS ====================

export const RECEIPT_UNITS = [
  'unit', 'gms', 'kg', 'lbs', 'oz', 'ml', 'ltr', 'box', 'pkt', 'bunch'
];

export function receiptUnitOptionsHtml() {
  return RECEIPT_UNITS.map(u => `<option value="${u}">${u}</option>`).join('');
}

export function calcReceiptItemTotal(qty, rate) {
  return Math.round((parseFloat(qty) || 0) * (parseFloat(rate) || 0) * 100) / 100;
}

export function calcReceiptTotals(items, taxPercent = 0, discount = 0) {
  const subtotal = (items || []).reduce((sum, i) => sum + (parseFloat(i.total) || 0), 0);
  const taxAmount = subtotal * ((parseFloat(taxPercent) || 0) / 100);
  const total = subtotal + taxAmount;
  const grandTotal = Math.max(0, total - (parseFloat(discount) || 0));
  return {
    subtotal: roundMoney(subtotal),
    taxAmount: roundMoney(taxAmount),
    total: roundMoney(total),
    grandTotal: roundMoney(grandTotal)
  };
}

function roundMoney(n) {
  return Math.round((parseFloat(n) || 0) * 100) / 100;
}

/** Read line items from the form DOM. */
export function collectReceiptItemsFromDom(container) {
  const items = [];
  container?.querySelectorAll('.receipt-item-row').forEach(row => {
    const qty = parseFloat(row.querySelector('.rec-qty')?.value) || 0;
    const unit = row.querySelector('.rec-unit')?.value || 'unit';
    const item = row.querySelector('.rec-item')?.value?.trim() || '';
    const rate = parseFloat(row.querySelector('.rec-rate')?.value) || 0;
    const total = parseFloat(row.querySelector('.rec-total')?.value) || calcReceiptItemTotal(qty, rate);
    if (qty > 0 && item && rate > 0) {
      items.push({ qty, unit, item, rate, total });
    }
  });
  return items;
}

/** Build preview/export payload from form fields. */
export function buildReceiptDataFromForm(formRoot, extras = {}) {
  const date = formRoot.querySelector('#receiptDate')?.value;
  const vendor = formRoot.querySelector('#receiptVendor')?.value?.trim() || '';
  const location = formRoot.querySelector('#receiptLocation')?.value?.trim() || '';
  const currency = formRoot.querySelector('#receiptCurrency')?.value;
  const taxPercent = parseFloat(formRoot.querySelector('#receiptTax')?.value) || 0;
  const discount = parseFloat(formRoot.querySelector('#receiptDiscount')?.value) || 0;
  const items = collectReceiptItemsFromDom(formRoot.querySelector('#receiptItemsContainer'));
  const totals = calcReceiptTotals(items, taxPercent, discount);

  return {
    date,
    vendor,
    location,
    currency,
    items,
    taxPercent,
    discount,
    ...totals,
    taxAmount: totals.taxAmount,
    receiptNumber: extras.receiptNumber || null,
    receiptHash: extras.receiptHash || null
  };
}

export function recordToReceiptData(record) {
  if (!record) return null;
  let items = record.items;
  if (typeof items === 'string') {
    try { items = JSON.parse(items); } catch { items = []; }
  }
  return {
    date: record.receipt_date,
    vendor: record.vendor || '',
    location: record.location || '',
    currency: record.currency,
    items: items || [],
    taxPercent: parseFloat(record.tax_percent) || 0,
    taxAmount: parseFloat(record.tax_amount) || 0,
    discount: parseFloat(record.discount) || 0,
    subtotal: parseFloat(record.subtotal) || 0,
    total: parseFloat(record.total) || 0,
    grandTotal: parseFloat(record.grand_total) || 0,
    receiptNumber: record.receipt_number,
    receiptHash: record.receipt_hash || record.receipt_number
  };
}

export function receiptDataToDbPayload(data, teamId, userId, existing = null) {
  const now = new Date().toISOString();
  return {
    id: existing?.id || crypto.randomUUID(),
    team_id: teamId,
    receipt_number: data.receiptNumber || existing?.receipt_number,
    receipt_date: data.date,
    vendor: data.vendor || null,
    location: data.location || null,
    currency: data.currency,
    items: data.items,
    tax_percent: data.taxPercent,
    tax_amount: data.taxAmount,
    discount: data.discount,
    subtotal: data.subtotal,
    total: data.total,
    grand_total: data.grandTotal,
    receipt_hash: data.receiptHash || data.receiptNumber,
    image_url: existing?.image_url || null,
    expense_id: existing?.expense_id || null,
    created_by: existing?.created_by || userId,
    created_at: existing?.created_at || now,
    updated_at: now,
    is_deleted: false
  };
}

/** Next receipt number: RCP-YYYY-0001 */
export function nextReceiptNumber(existingRecords) {
  const year = new Date().getFullYear();
  const prefix = `RCP-${year}-`;
  const nums = (existingRecords || [])
    .map(r => r.receipt_number)
    .filter(n => n?.startsWith(prefix))
    .map(n => parseInt(n.slice(prefix.length), 10) || 0);
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

export function renderReceiptHtml(data) {
  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = new Date(data.date).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric'
  });

  const itemsHtml = (data.items || []).map(item => `
    <div class="item-row">
      <div class="item-desc">
        <span class="item-name">${escapeHtml(item.item)}</span>
        <span class="item-meta">${item.qty} × 1 ${escapeHtml(item.unit)} @ ${item.rate.toFixed(2)}/${escapeHtml(item.unit)}</span>
      </div>
      <span class="item-amount">${item.total.toFixed(2)}</span>
    </div>
  `).join('');

  const taxHtml = data.taxAmount > 0 ? `
    <div class="total-row">
      <span>Tax (${data.taxPercent.toFixed(2)}%):</span>
      <span>${data.taxAmount.toFixed(2)} ${escapeHtml(data.currency)}</span>
    </div>
  ` : '';

  const discountHtml = data.discount > 0 ? `
    <div class="total-row receipt-discount-row">
      <span>Discount:</span>
      <span>-${data.discount.toFixed(2)} ${escapeHtml(data.currency)}</span>
    </div>
  ` : '';

  const vendorHtml = data.vendor
    ? `<h1>${escapeHtml(data.vendor)}</h1>`
    : '<h1>RECEIPT</h1>';
  const locationHtml = data.location
    ? `<div class="receipt-location">${escapeHtml(data.location)}</div>`
    : '';

  const hashLine = data.receiptHash || data.receiptNumber || Date.now().toString().slice(-13);

  return `
    <div id="generatedReceipt">
      <div class="receipt-header-print">
        ${vendorHtml}
        <div class="receipt-date">${dateStr} &nbsp; ${timeStr}</div>
        ${locationHtml}
      </div>
      <div class="items-list">${itemsHtml}</div>
      <div class="totals-section">
        <div class="total-row">
          <span>Subtotal (${data.items.length} items):</span>
          <span>${data.subtotal.toFixed(2)} ${escapeHtml(data.currency)}</span>
        </div>
        ${taxHtml}
        <div class="total-row">
          <span>Total:</span>
          <span>${data.total.toFixed(2)} ${escapeHtml(data.currency)}</span>
        </div>
        ${discountHtml}
        <div class="total-row grand">
          <span>GRAND TOTAL</span>
          <span>${data.grandTotal.toFixed(2)} ${escapeHtml(data.currency)}</span>
        </div>
      </div>
      <div class="receipt-footer-print">
        <div class="receipt-hash">* ${escapeHtml(hashLine)} *</div>
        <div class="thanks">Thank you for your business!</div>
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function receiptItemRowHtml(showRemove = false) {
  return `
    <div class="receipt-item-row">
      <input type="number" class="rec-qty" step="0.01" placeholder="Qty" required>
      <select class="rec-unit" required>${receiptUnitOptionsHtml()}</select>
      <input type="text" class="rec-item" placeholder="Item name" required>
      <input type="number" class="rec-rate input-amount" step="0.01" placeholder="Rate" required>
      <input type="number" class="rec-total input-amount" step="0.01" placeholder="Total" readonly>
      <button type="button" class="cat-remove-btn receipt-item-remove" ${showRemove ? '' : 'style="visibility:hidden;"'} aria-label="Remove item">×</button>
    </div>
  `;
}
