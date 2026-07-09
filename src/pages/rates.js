// ==================== EXCHANGE RATES PAGE ====================
import { state } from '../state.js';
import { sbSelect, sbInsert, sbSoftDelete } from '../db.js';
import { showToast } from '../components/toasts.js';
import { LOCAL_CURRENCIES, rateDisplayLabel, normalizeRateRecord } from '../utils/currency.js';

let allRates = [];

function currencyOptionsHtml() {
  return LOCAL_CURRENCIES.map(c => `<option value="${c}">${c}</option>`).join('');
}

export function getRatesPage() {
  const currencyOptions = currencyOptionsHtml();
  return `
    <h1 class="page-title">Exchange Rates</h1>

    <div class="card">
      <h2>💱 Add Exchange Rate</h2>
      <form id="rateForm" onsubmit="window.addRate(event)">
        <div class="rate-form-row">
          <div class="form-group">
            <label for="rateDate">Date *</label>
            <input type="date" id="rateDate" required>
          </div>
          <div class="form-group">
            <label for="rateLocalCurrency">Currency *</label>
            <select id="rateLocalCurrency" required>
              <option value="">—</option>
              ${currencyOptions}
            </select>
          </div>
          <div class="form-group">
            <label for="rateValue" id="rateValueLabel">Rate (1 USD = ?) *</label>
            <input type="number" class="input-rate" id="rateValue" step="any" min="0.000001" placeholder="95.4" required>
          </div>
          <p class="form-hint" id="rateHint">Enter how many units of local currency equal 1 USD (e.g. 95.4 for INR).</p>
        </div>
        <div class="btn-group">
          <button type="submit">Add Rate</button>
        </div>
      </form>
    </div>

    <div class="card">
      <h2>📋 Exchange Rate History</h2>
      <div class="table-container">
        <table class="table-stack-mobile">
          <thead>
            <tr>
              <th>Date</th>
              <th>Currency</th>
              <th>Rate</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="ratesList"></tbody>
        </table>
      </div>
    </div>
  `;
}

export async function initRatesPage() {
  document.getElementById('rateDate').valueAsDate = new Date();

  window.addRate = addRate;
  window.deleteRate = deleteRate;

  await loadRates();
}

async function loadRates() {
  const tbody = document.getElementById('ratesList');
  tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Loading rates...</td></tr>';

  try {
    const { data: rates, error } = await sbSelect('exchange_rates', {
      teamId: state.currentTeam.team_id,
      orderBy: 'date',
      ascending: false
    });

    if (error) throw error;

    allRates = rates || [];
    renderRates();

  } catch (err) {
    console.error('Load rates error:', err);
    tbody.innerHTML = `<tr><td colspan="4" class="empty-state" style="color: #dc3545;">Error: ${err.message}</td></tr>`;
    showToast('Failed to load rates', 'error');
  }
}

function renderRates() {
  const tbody = document.getElementById('ratesList');

  if (allRates.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No exchange rates set for this team yet.</td></tr>';
    return;
  }

  let html = '';
  allRates.forEach(rate => {
    const normalized = normalizeRateRecord(rate);
    const currency = normalized?.currency || rate.from_currency || '—';
    const displayRate = normalized?.rate ?? rate.rate;
    html += `
      <tr>
        <td data-label="Date">${rate.date}</td>
        <td data-label="Currency"><span class="badge badge-info">${currency}</span></td>
        <td data-label="Rate" class="currency-display">${rateDisplayLabel(currency, displayRate)}</td>
        <td data-label="Actions">
          <button class="danger small" onclick="window.deleteRate('${rate.id}')">Delete</button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

async function addRate(e) {
  e.preventDefault();

  const currency = document.getElementById('rateLocalCurrency').value;
  const rateValue = parseFloat(document.getElementById('rateValue').value);

  const rateData = {
    date: document.getElementById('rateDate').value,
    from_currency: 'USD',
    to_currency: currency,
    rate: rateValue,
    team_id: state.currentTeam.team_id,
    created_by: state.user.id,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    is_deleted: false
  };

  if (!currency) {
    showToast('Please select a currency', 'error');
    return;
  }
  if (!rateValue || rateValue <= 0) {
    showToast('Please enter a valid rate', 'error');
    return;
  }

  try {
    const { error } = await sbInsert('exchange_rates', rateData);
    if (error) throw error;

    showToast(`Rate added: ${rateDisplayLabel(currency, rateValue)}`, 'success');
    document.getElementById('rateForm').reset();
    document.getElementById('rateDate').valueAsDate = new Date();
    await loadRates();

  } catch (err) {
    console.error('Add rate error:', err);
    showToast('Failed to add rate: ' + err.message, 'error');
  }
}

async function deleteRate(rateId) {
  if (!confirm('Delete this exchange rate?')) return;

  try {
    const { error } = await sbSoftDelete('exchange_rates', rateId);
    if (error) throw error;
    showToast('Rate deleted', 'success');
    await loadRates();
  } catch (err) {
    console.error('Delete rate error:', err);
    showToast('Failed to delete rate: ' + err.message, 'error');
  }
}
