// ==================== EXCHANGE RATES PAGE ====================
import { state } from '../state.js';
import { sbSelect, sbInsert, sbUpdate, sbSoftDelete } from '../db.js';
import { showToast } from '../components/toasts.js';
import { createModal, openModal, closeModal } from '../components/modals.js';

let allRates = [];

export function getRatesPage() {
  return `
    <h1 class="page-title">Exchange Rates</h1>

    <div class="card">
      <h2>💱 Add Exchange Rate</h2>
      <form id="rateForm" onsubmit="window.addRate(event)">
        <div class="form-grid">
          <div class="form-group">
            <label>Date *</label>
            <input type="date" id="rateDate" required>
          </div>
          <div class="form-group">
            <label>From Currency *</label>
            <select id="rateFromCurrency" required>
              <option value="">Select Currency</option>
              <option value="USD">USD</option>
              <option value="XOF">XOF</option>
              <option value="AED">AED</option>
              <option value="INR">INR</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
            </select>
          </div>
          <div class="form-group">
            <label>To Currency *</label>
            <select id="rateToCurrency" required>
              <option value="">Select Currency</option>
              <option value="USD" selected>USD</option>
              <option value="XOF">XOF</option>
              <option value="AED">AED</option>
              <option value="INR">INR</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
            </select>
          </div>
          <div class="form-group">
            <label>Rate (1 From = ? To) *</label>
            <input type="number" id="rateValue" step="0.000001" placeholder="0.001802" required>
          </div>
        </div>
        <div class="btn-group">
          <button type="submit">Add Rate</button>
        </div>
      </form>
    </div>

    <div class="card">
      <h2>📋 Exchange Rate History</h2>
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>From</th>
              <th>To</th>
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
  tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Loading rates...</td></tr>';

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
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state" style="color: #dc3545;">Error: ${err.message}</td></tr>`;
    showToast('Failed to load rates', 'error');
  }
}

function renderRates() {
  const tbody = document.getElementById('ratesList');

  if (allRates.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No exchange rates set for this team yet.</td></tr>';
    return;
  }

  let html = '';
  allRates.forEach(rate => {
    html += `
      <tr>
        <td>${rate.date}</td>
        <td><span class="badge badge-info">${rate.from_currency}</span></td>
        <td><span class="badge badge-info">${rate.to_currency}</span></td>
        <td class="currency-display">${rate.rate}</td>
        <td>
          <button class="danger small" onclick="window.deleteRate('${rate.id}')">Delete</button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

async function addRate(e) {
  e.preventDefault();

  const rateData = {
    date: document.getElementById('rateDate').value,
    from_currency: document.getElementById('rateFromCurrency').value,
    to_currency: document.getElementById('rateToCurrency').value,
    rate: parseFloat(document.getElementById('rateValue').value),
    team_id: state.currentTeam.team_id,
    created_by: state.user.id,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    is_deleted: false
  };

  if (!rateData.rate || rateData.rate <= 0) {
    showToast('Please enter a valid rate', 'error');
    return;
  }

  try {
    const { error } = await sbInsert('exchange_rates', rateData);
    if (error) throw error;

    showToast(`Rate added: 1 ${rateData.from_currency} = ${rateData.rate} ${rateData.to_currency}`, 'success');
    document.getElementById('rateForm').reset();
    document.getElementById('rateDate').valueAsDate = new Date();
    document.getElementById('rateToCurrency').value = 'USD';
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
