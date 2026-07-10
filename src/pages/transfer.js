/* ========== TRANSFER FUNDS MODULE (Phase 1) ========== */
import { state } from '../state.js';
import { sbInsert, sbSelect, supabaseClient } from '../db.js';
import { showToast, showConfirm } from '../components/toasts.js';
import { rateForInput, getLatestUsdRate, formatRate } from '../utils/currency.js';
import { applyDefaultsToTransferForm, loadUserTeamDefaultsForCurrentTeam } from '../utils/userTeamDefaults.js';
import {
  TRANSFER_STATUS,
  MEMO_MAX_LENGTH,
  isTeamLeadAccess,
  classifyTransferFlow,
  validateTransferMemo,
  computeDestAmount,
  applyAcceptedTransferBalances,
  getTransferStatusBadge,
  filterBucketsForTransferSource,
  filterBucketsForTransferDest,
  isOperationalBucket,
  isMemberBucket
} from '../utils/transferHelpers.js';
import {
  acceptTransfer,
  rejectTransfer,
  cancelPendingTransfer,
  fetchSentTransfers
} from '../utils/transferActions.js';

let teamBucketsCache = [];
let exchangeRatesCache = [];
let sentTransfersCache = [];
let destFilterState = { showMembers: false, showTeam: false };

async function loadTeamBuckets() {
  const teamId = state.currentTeam?.team_id;
  if (!teamId) {
    teamBucketsCache = [];
    return [];
  }
  const result = await sbSelect('buckets', { teamId, orderBy: 'name', ascending: true });
  teamBucketsCache = (result.data || []).filter(b => !b.is_deleted);
  return teamBucketsCache;
}

function getBucketById(bucketId) {
  return teamBucketsCache.find(b => b.id === bucketId);
}

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

async function auditLog(action, entityId, oldValues, newValues) {
  try {
    if (!state.user?.id) return;
    await supabaseClient.rpc('log_audit', {
      p_user_id: state.user.id,
      p_action: action,
      p_entity_type: 'transfers',
      p_entity_id: entityId,
      p_old_values: oldValues || null,
      p_new_values: newValues || null
    });
  } catch (err) {
    console.warn('Audit log non-critical error:', err.message);
  }
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function populateSourceSelect() {
  const select = document.getElementById('trSourceBucketId');
  if (!select) return;
  const current = select.value;
  const sources = filterBucketsForTransferSource(teamBucketsCache, state);
  select.innerHTML = '<option value="">Select source</option>';
  sources.forEach(b => {
    const tag = isMemberBucket(b) ? ' · Personal' : '';
    select.innerHTML += `<option value="${b.id}" data-currency="${b.currency}">${escapeHtml(b.name)}${tag} (${b.currency})</option>`;
  });
  if (sources.some(b => b.id === current)) select.value = current;
}

function populateDestSelect() {
  const select = document.getElementById('trDestBucketId');
  if (!select) return;
  const current = select.value;
  const dests = filterBucketsForTransferDest(teamBucketsCache, state, destFilterState);
  const srcId = document.getElementById('trSourceBucketId')?.value;
  select.innerHTML = '<option value="">Select destination</option>';
  dests.filter(b => b.id !== srcId).forEach(b => {
    const tag = isMemberBucket(b) ? ' · Member' : ' · Team';
    select.innerHTML += `<option value="${b.id}" data-currency="${b.currency}">${escapeHtml(b.name)}${tag} (${b.currency})</option>`;
  });
  if (dests.some(b => b.id === current && b.id !== srcId)) select.value = current;
}

function updateDestFilterVisibility() {
  const lead = isTeamLeadAccess(state);
  const memberFilters = document.getElementById('trMemberFilters');
  const otmFilters = document.getElementById('trOtmFilters');
  if (memberFilters) memberFilters.style.display = lead ? '' : 'none';
  if (otmFilters) otmFilters.style.display = lead ? 'none' : '';
}

export function getTransferFundsPage() {
  if (!state.canTransferFunds) {
    return `
      <h1 class="page-title">Transfer Funds</h1>
      <div class="card">
        <h2>⛔ Access Denied</h2>
        <p>You do not have permission to transfer funds.</p>
      </div>
    `;
  }

  const lead = isTeamLeadAccess(state);

  return `
    <h1 class="page-title">Transfer Funds</h1>
    <p class="page-intro">Send money within your team. Sent transfers appear below; confirm received money on the Dashboard.</p>

    <div class="card">
      <h2>🔄 New Transfer</h2>
      <form id="transferFundsForm" onsubmit="window.executeFundsTransfer(event)">
        <div class="form-stack">
          <div id="trMemberFilters" class="transfer-filter-row" style="display:none;">
            <label class="checkbox-inline"><input type="checkbox" id="trShowMembers" onchange="window.onTransferDestFilterChange()"> Include member wallets</label>
          </div>
          <div id="trOtmFilters" class="transfer-filter-row" style="display:none;">
            <label class="checkbox-inline"><input type="checkbox" id="trShowTeamPeers" onchange="window.onTransferDestFilterChange()"> Team bucket</label>
            <label class="checkbox-inline"><input type="checkbox" id="trShowMemberPeers" onchange="window.onTransferDestFilterChange()"> Member wallets</label>
          </div>

          <div class="form-grid-row form-grid-row--transfer-buckets">
            <div class="form-group"><label>Transfer Date</label><input type="date" id="trDate" required></div>
            <div class="form-group"><label>Source Bucket</label><select id="trSourceBucketId" required onchange="window.onTransferBucketChange()"><option value="">Loading…</option></select><span class="form-field-hint" id="trSourceCurrency">Currency: —</span></div>
            <div class="form-group"><label>Destination Bucket</label><select id="trDestBucketId" required onchange="window.onTransferBucketChange()"><option value="">Loading…</option></select><span class="form-field-hint" id="trDestCurrency">Currency: —</span></div>
          </div>

          <div class="form-grid-row form-grid-row--transfer-amount">
            <div class="form-group"><label>Amount <span id="trAmountCurrencyLabel" style="font-weight:600;color:var(--primary);">(USD)</span></label><input type="number" class="input-amount" id="trAmount" step="0.01" placeholder="0.00" required oninput="window.onTransferAmountChange()"></div>
            <div class="form-group"><label id="trRateLabel">Rate (1 USD = ?)</label><input type="number" class="input-rate" id="trRate" step="any" min="0.000001" placeholder="95.4" oninput="window.onTransferAmountChange()"></div>
            <div class="form-group"><label>Converted <span id="trConvertedCurrencyLabel" style="font-weight:600;color:var(--primary);"></span></label><input type="number" class="input-amount" id="trConvertedAmount" step="0.01" readonly style="background:#f3f4f6;"><span class="form-field-hint" id="trConvertedLabel">—</span></div>
          </div>
          <div class="form-group">
            <label>Memo * <span class="form-hint">(max ${MEMO_MAX_LENGTH} chars)</span></label>
            <input type="text" id="trMemo" maxlength="${MEMO_MAX_LENGTH}" required placeholder="Reason for transfer">
          </div>
        </div>
        <div id="trValidationError" class="form-error-inline" style="display:none;"></div>
        <button type="submit" id="trSubmitBtn" class="btn-block">Send Transfer</button>
      </form>
      ${lead ? '<p class="form-hint">Team operational transfers complete immediately. Transfers to member wallets wait for member confirmation.</p>' : '<p class="form-hint">Transfers to team or members wait for confirmation. You can only send from your personal wallet.</p>'}
    </div>

    <div class="card">
      <div class="transfer-list-header">
        <h2>📤 Sent Transfers</h2>
        <div class="form-group transfer-status-filter">
          <label>Status</label>
          <select id="trStatusFilter" onchange="window.refreshSentTransfersList()">
            <option value="">All</option>
            <option value="PENDING">Pending</option>
            <option value="ACCEPTED">Accepted</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>
      </div>
      <div class="table-container">
        <table class="table-stack-mobile transfer-history-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>From</th>
              <th>To</th>
              <th>Amount</th>
              <th>Memo</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="trSentListBody">
            <tr><td colspan="7" class="empty-state">Loading…</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

export async function initTransferFundsPage() {
  if (!state.canTransferFunds) return;

  const d = document.getElementById('trDate');
  if (d) d.value = new Date().toISOString().split('T')[0];

  await loadTeamBuckets();
  await loadExchangeRates();

  destFilterState = { showMembers: false, showTeam: false };
  updateDestFilterVisibility();
  populateSourceSelect();
  populateDestSelect();

  await loadUserTeamDefaultsForCurrentTeam();
  applyDefaultsToTransferForm({
    sourceSelect: document.getElementById('trSourceBucketId'),
    destSelect: document.getElementById('trDestBucketId')
  });

  window.onTransferBucketChange = onTransferBucketChange;
  window.onTransferAmountChange = onTransferAmountChange;
  window.onTransferDestFilterChange = onTransferDestFilterChange;
  window.executeFundsTransfer = executeFundsTransfer;
  window.refreshSentTransfersList = refreshSentTransfersList;
  window.cancelSentTransfer = cancelSentTransfer;

  onTransferBucketChange();
  await refreshSentTransfersList();
}

function onTransferDestFilterChange() {
  const lead = isTeamLeadAccess(state);
  if (lead) {
    destFilterState.showMembers = !!document.getElementById('trShowMembers')?.checked;
  } else {
    destFilterState.showTeam = !!document.getElementById('trShowTeamPeers')?.checked;
    destFilterState.showMembers = !!document.getElementById('trShowMemberPeers')?.checked;
  }
  populateDestSelect();
  onTransferBucketChange();
}

async function refreshSentTransfersList() {
  const tbody = document.getElementById('trSentListBody');
  if (!tbody) return;
  const teamId = state.currentTeam?.team_id;
  const statusFilter = document.getElementById('trStatusFilter')?.value || '';

  try {
    sentTransfersCache = await fetchSentTransfers(teamId, state.user?.id, { statusFilter });

    if (!sentTransfersCache.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No sent transfers yet.</td></tr>';
      return;
    }

    tbody.innerHTML = sentTransfersCache.map(t => {
      const src = getBucketById(t.from_bucket_id);
      const dest = getBucketById(t.to_bucket_id);
      const badge = getTransferStatusBadge(t.status);
      const canCancel = t.status === TRANSFER_STATUS.PENDING;
      return `
        <tr>
          <td data-label="Date">${escapeHtml(t.date)}</td>
          <td data-label="From">${escapeHtml(src?.name || '—')}</td>
          <td data-label="To">${escapeHtml(dest?.name || '—')}</td>
          <td data-label="Amount">${parseFloat(t.amount).toFixed(2)} ${escapeHtml(t.currency || '')}</td>
          <td data-label="Memo">${escapeHtml(t.description || '')}</td>
          <td data-label="Status"><span class="badge ${badge.class}">${badge.label}</span></td>
          <td data-label="Actions" class="action-buttons">
            ${canCancel ? `<button type="button" class="danger small" onclick="window.cancelSentTransfer('${t.id}')">Cancel</button>` : '—'}
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Load sent transfers:', err);
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state" style="color:#dc3545;">${escapeHtml(err.message)}</td></tr>`;
  }
}

async function cancelSentTransfer(id) {
  showConfirm('Cancel this pending transfer?', async () => {
    try {
      await cancelPendingTransfer(id);
      showToast('Transfer cancelled', 'success');
      await loadTeamBuckets();
      await refreshSentTransfersList();
    } catch (err) {
      showToast(err.message || 'Cancel failed', 'error');
    }
  });
}

function onTransferBucketChange() {
  const srcId = document.getElementById('trSourceBucketId')?.value;
  const destId = document.getElementById('trDestBucketId')?.value;
  const srcBucket = getBucketById(srcId);
  const destBucket = getBucketById(destId);

  const srcCurrencyEl = document.getElementById('trSourceCurrency');
  const destCurrencyEl = document.getElementById('trDestCurrency');
  const amountLabel = document.getElementById('trAmountCurrencyLabel');
  const convertedCurrencyLabel = document.getElementById('trConvertedCurrencyLabel');
  const rateInput = document.getElementById('trRate');
  const convertedInput = document.getElementById('trConvertedAmount');
  const convertedLabel = document.getElementById('trConvertedLabel');
  const rateLabel = document.getElementById('trRateLabel');

  if (srcBucket) {
    srcCurrencyEl.textContent = `Currency: ${srcBucket.currency}`;
    if (amountLabel) amountLabel.textContent = `(${srcBucket.currency})`;
  } else {
    srcCurrencyEl.textContent = 'Currency: —';
    if (amountLabel) amountLabel.textContent = '(USD)';
  }

  if (destBucket) {
    destCurrencyEl.textContent = `Currency: ${destBucket.currency}`;
    if (convertedCurrencyLabel) convertedCurrencyLabel.textContent = `(${destBucket.currency})`;
  } else {
    destCurrencyEl.textContent = 'Currency: —';
    if (convertedCurrencyLabel) convertedCurrencyLabel.textContent = '';
  }

  if (srcBucket && destBucket) {
    const srcCurr = srcBucket.currency || 'USD';
    const destCurr = destBucket.currency || 'USD';

    if (srcCurr === destCurr) {
      if (rateInput) rateInput.value = '1';
      if (rateLabel) rateLabel.textContent = 'Exchange Rate (1 USD = 1 USD)';
      if (convertedInput) convertedInput.value = '';
      if (convertedLabel) convertedLabel.textContent = 'Same currency — no conversion needed';
    } else if (srcCurr === 'USD') {
      const destRate = getLatestUsdRate(exchangeRatesCache, destCurr);
      if (rateLabel) rateLabel.textContent = `Exchange Rate (1 USD = ? ${destCurr})`;
      if (destRate !== null) {
        if (rateInput) rateInput.value = rateForInput(destRate);
        onTransferAmountChange();
      } else {
        if (rateInput && !rateInput.value) rateInput.value = '';
        if (convertedInput) convertedInput.value = '';
        if (convertedLabel) convertedLabel.textContent = `No exchange rate for ${destCurr}. Add in Setup.`;
      }
    } else if (destCurr === 'USD') {
      const srcRate = getLatestUsdRate(exchangeRatesCache, srcCurr);
      if (rateLabel) rateLabel.textContent = `Exchange Rate (1 USD = ? ${srcCurr})`;
      if (srcRate !== null) {
        if (rateInput) rateInput.value = rateForInput(srcRate);
        onTransferAmountChange();
      } else {
        if (rateInput) rateInput.value = '';
        if (convertedInput) convertedInput.value = '';
        if (convertedLabel) convertedLabel.textContent = `No exchange rate for ${srcCurr}. Add in Setup.`;
      }
    } else {
      const srcRate = getLatestUsdRate(exchangeRatesCache, srcCurr);
      const destRate = getLatestUsdRate(exchangeRatesCache, destCurr);
      if (rateLabel) rateLabel.textContent = `Exchange Rate (1 USD = ? ${srcCurr})`;
      if (srcRate !== null) rateInput.value = rateForInput(srcRate);
      if (destRate !== null && srcRate !== null) {
        if (convertedLabel) convertedLabel.textContent = `Also using 1 USD = ${formatRate(destRate)} ${destCurr}`;
        onTransferAmountChange();
      }
    }
  } else {
    if (rateInput && !rateInput.value) rateInput.value = '';
    if (convertedInput) convertedInput.value = '';
    if (convertedLabel) convertedLabel.textContent = '—';
  }
}

function onTransferAmountChange() {
  const amount = parseFloat(document.getElementById('trAmount')?.value) || 0;
  const rate = parseFloat(document.getElementById('trRate')?.value) || 0;
  const convertedInput = document.getElementById('trConvertedAmount');
  const convertedLabel = document.getElementById('trConvertedLabel');
  const srcBucket = getBucketById(document.getElementById('trSourceBucketId')?.value);
  const destBucket = getBucketById(document.getElementById('trDestBucketId')?.value);

  if (!srcBucket || !destBucket || amount <= 0) {
    if (convertedInput) convertedInput.value = '';
    return;
  }

  const srcCurr = srcBucket.currency || 'USD';
  const destCurr = destBucket.currency || 'USD';

  if (srcCurr === destCurr) {
    if (convertedInput) convertedInput.value = amount.toFixed(2);
    if (convertedLabel) convertedLabel.textContent = `Destination receives ${amount.toFixed(2)} ${destCurr}`;
    return;
  }

  let converted = null;
  if (srcCurr === 'USD' && destCurr !== 'USD') {
    if (rate <= 0) return;
    converted = amount * rate;
  } else if (srcCurr !== 'USD' && destCurr === 'USD') {
    if (rate <= 0) return;
    converted = amount / rate;
  } else {
    const srcUsdRate = rate > 0 ? rate : getLatestUsdRate(exchangeRatesCache, srcCurr);
    const destUsdRate = getLatestUsdRate(exchangeRatesCache, destCurr);
    if (!srcUsdRate || !destUsdRate) return;
    converted = (amount / srcUsdRate) * destUsdRate;
  }

  if (converted !== null && convertedInput) {
    convertedInput.value = converted.toFixed(2);
    if (convertedLabel) convertedLabel.textContent = `Destination receives ${convertedInput.value} ${destCurr}`;
  }
}

async function executeFundsTransfer(e) {
  e.preventDefault();

  const srcId = document.getElementById('trSourceBucketId').value;
  const destId = document.getElementById('trDestBucketId').value;
  const amount = parseFloat(document.getElementById('trAmount').value) || 0;
  const rate = parseFloat(document.getElementById('trRate').value) || 0;
  const memoCheck = validateTransferMemo(document.getElementById('trMemo')?.value);
  const errorEl = document.getElementById('trValidationError');

  const showError = (msg) => {
    if (errorEl) {
      errorEl.textContent = msg;
      errorEl.style.display = 'block';
    }
  };

  if (!memoCheck.ok) {
    showError(memoCheck.message);
    return;
  }
  if (!srcId || !destId || srcId === destId) {
    showError('Select different source and destination buckets.');
    return;
  }
  if (amount <= 0) {
    showError('Amount must be greater than zero.');
    return;
  }

  const srcBucket = getBucketById(srcId);
  const destBucket = getBucketById(destId);
  if (!srcBucket || !destBucket) {
    showError('Invalid buckets.');
    return;
  }

  const senderIsOtl = isTeamLeadAccess(state);
  const flow = classifyTransferFlow(srcBucket, destBucket, senderIsOtl);

  if (!senderIsOtl && isOperationalBucket(srcBucket)) {
    showError('Members can only send from their personal wallet.');
    return;
  }
  if (!senderIsOtl && isMemberBucket(srcBucket) && srcBucket.owner_user_id !== state.user?.id) {
    showError('You can only send from your own wallet.');
    return;
  }

  const srcCurr = srcBucket.currency || 'USD';
  const destCurr = destBucket.currency || 'USD';
  if (srcCurr !== destCurr && rate <= 0) {
    showError('Exchange rate required for cross-currency transfer.');
    return;
  }

  if (flow.status === TRANSFER_STATUS.ACCEPTED) {
    if ((parseFloat(srcBucket.balance) || 0) < amount) {
      showError('Insufficient balance in source bucket.');
      return;
    }
  }

  if (errorEl) errorEl.style.display = 'none';

  const teamId = state.currentTeam?.team_id;
  const transferId = crypto.randomUUID();
  const destAmount = computeDestAmount(
    { amount, rate, currency: srcCurr, date: document.getElementById('trDate').value },
    destBucket,
    exchangeRatesCache
  );

  const transferPayload = {
    id: transferId,
    team_id: teamId,
    date: document.getElementById('trDate').value,
    from_bucket_id: srcId,
    to_bucket_id: destId,
    amount,
    rate: rate || 1,
    currency: srcCurr,
    dest_amount: destAmount,
    dest_currency: destCurr,
    description: memoCheck.value,
    status: flow.status,
    flow_type: flow.flow,
    receiver_user_id: flow.receiver_user_id,
    receiver_kind: flow.receiver_kind,
    created_by: state.user?.id,
    created_at: new Date().toISOString(),
    is_deleted: false
  };

  if (flow.status === TRANSFER_STATUS.ACCEPTED) {
    transferPayload.accepted_at = new Date().toISOString();
  }

  const btn = document.getElementById('trSubmitBtn');
  btn.disabled = true;
  btn.textContent = 'Sending…';

  try {
    if (flow.status === TRANSFER_STATUS.ACCEPTED) {
      await applyAcceptedTransferBalances(transferPayload, srcBucket, destBucket, exchangeRatesCache);
    }

    const result = await sbInsert('transfers', transferPayload);
    if (result?.error) throw new Error(result.error.message);

    const saved = result.data?.[0] || transferPayload;
    await auditLog('INSERT', saved.id, null, saved);

    if (flow.status === TRANSFER_STATUS.PENDING) {
      showToast('Transfer sent — waiting for confirmation', 'success');
    } else {
      showToast(`Transferred ${amount.toFixed(2)} ${srcCurr} successfully`, 'success');
    }

    e.target.reset();
    document.getElementById('trDate').value = new Date().toISOString().split('T')[0];
    await loadTeamBuckets();
    populateSourceSelect();
    populateDestSelect();
    onTransferBucketChange();
    await refreshSentTransfersList();
  } catch (err) {
    console.error('Transfer error:', err);
    showToast(err.message || 'Transfer failed', 'error');
    showError(err.message || 'Transfer failed');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send Transfer';
  }
}

// Dashboard hooks
export async function acceptTransferFromDashboard(transferId) {
  try {
    await acceptTransfer(transferId);
    showToast('Transfer accepted — balances updated', 'success');
    return true;
  } catch (err) {
    showToast(err.message || 'Accept failed', 'error');
    return false;
  }
}

export async function rejectTransferFromDashboard(transferId) {
  try {
    await rejectTransfer(transferId);
    showToast('Transfer rejected', 'success');
    return true;
  } catch (err) {
    showToast(err.message || 'Reject failed', 'error');
    return false;
  }
}
