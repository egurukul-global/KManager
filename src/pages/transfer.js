/* ========== TRANSFER FUNDS MODULE (Phase 1) ========== */
import { state } from '../state.js';
import { sbInsert, sbSelect, supabaseClient } from '../db.js';
import { showToast, showConfirm } from '../components/toasts.js';
import { rateForInput, getLatestUsdRate, formatRate } from '../utils/currency.js';
import { applyDefaultsToTransferForm, loadUserTeamDefaultsForCurrentTeam } from '../utils/userTeamDefaults.js';
import {
  TRANSFER_STATUS,
  TRANSFER_FLOW,
  PENDING_STEP,
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
import { getMemberPersonalWallet, ensurePersonalTeamForUser } from '../utils/personalTeamHelpers.js';
import {
  acceptTransfer,
  rejectTransfer,
  cancelPendingTransfer,
  fetchSentTransfers
} from '../utils/transferActions.js';
import { createTransferApprovalRequest } from '../utils/approvalEngine.js';
import { uploadReceipt } from '../utils/upload.js';

let teamBucketsCache = [];
let exchangeRatesCache = [];
let sentTransfersCache = [];
let teamMembersCache = [];
let teamBudgetsCache = [];
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
    const tag = isMemberBucket(b) ? ' Â· Personal' : '';
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
    const tag = isMemberBucket(b) ? ' Â· Member' : ' Â· Team';
    select.innerHTML += `<option value="${b.id}" data-currency="${b.currency}">${escapeHtml(b.name)}${tag} (${b.currency})</option>`;
  });
  if (dests.some(b => b.id === current && b.id !== srcId)) select.value = current;
}

import { hasAnyGlobalFinanceRole } from '../utils/appRoles.js';

function updateDestFilterVisibility() {
  const lead = isTeamLeadAccess(state);
  const globalAdmin = hasAnyGlobalFinanceRole();
  const memberFilters = document.getElementById('trMemberFilters');
  const otmFilters = document.getElementById('trOtmFilters');
  const crossSection = document.getElementById('trCrossTeamSection');
  if (memberFilters) memberFilters.style.display = (lead && !globalAdmin) ? '' : 'none';
  if (otmFilters) otmFilters.style.display = (!lead || globalAdmin) ? '' : 'none';
  if (crossSection) crossSection.style.display = lead ? '' : 'none';
}

async function loadTeamMembers() {
  const teamId = state.currentTeam?.team_id;
  if (!teamId) {
    teamMembersCache = [];
    return [];
  }
  const { data, error } = await supabaseClient
    .from('user_teams')
    .select('user_id, access_level, users:user_id(id, name, email)')
    .eq('team_id', teamId);

  if (error) throw error;
  teamMembersCache = (data || [])
    .map(m => m.users)
    .filter(u => u && u.id !== state.user?.id);
  return teamMembersCache;
}

async function loadTeamBudgets() {
  const teamId = state.currentTeam?.team_id;
  if (!teamId) {
    teamBudgetsCache = [];
    return [];
  }
  const { data, error } = await supabaseClient
    .from('budget_plans')
    .select('id, name, status, budget_type')
    .eq('team_id', teamId)
    .eq('is_deleted', false)
    .neq('status', 'archive')
    .neq('status', 'archived')
    .order('name');

  if (error) throw error;
  teamBudgetsCache = data || [];
  return teamBudgetsCache;
}

function populateCrossTeamSelects() {
  const memberSelect = document.getElementById('trCrossMemberId');
  const budgetSelect = document.getElementById('trCrossBudgetId');
  if (memberSelect) {
    memberSelect.innerHTML = '<option value="">Select member</option>';
    teamMembersCache.forEach(u => {
      const label = u.name || u.email || u.id;
      memberSelect.innerHTML += `<option value="${u.id}">${escapeHtml(label)}</option>`;
    });
  }
  if (budgetSelect) {
    budgetSelect.innerHTML = '<option value="">Select budget</option>';
    teamBudgetsCache.forEach(b => {
      budgetSelect.innerHTML += `<option value="${b.id}">${escapeHtml(b.name)} (${escapeHtml(b.budget_type || '')})</option>`;
    });
  }
}

function onCrossTeamToggle() {
  const cross = !!document.getElementById('trCrossTeam')?.checked;
  const crossFields = document.getElementById('trCrossTeamFields');
  const destGroup = document.getElementById('trDestBucketId')?.closest('.form-group');
  const memberFilters = document.getElementById('trMemberFilters');

  if (crossFields) crossFields.style.display = cross ? '' : 'none';
  if (destGroup) destGroup.style.display = cross ? 'none' : '';
  if (memberFilters) memberFilters.style.display = cross ? 'none' : (isTeamLeadAccess(state) ? '' : 'none');

  const destSelect = document.getElementById('trDestBucketId');
  if (destSelect) destSelect.required = !cross;
}

export function getTransferFundsPage() {
  if (!state.canTransferFunds) {
    return `
      <h1 class="page-title">Transfer Funds</h1>
      <div class="card">
        <h2>â›” Access Denied</h2>
        <p>You do not have permission to transfer funds.</p>
      </div>
    `;
  }

  const lead = isTeamLeadAccess(state) || hasAnyGlobalFinanceRole();

    return `
      <h1 class="page-title">Transfer Funds</h1>
    <p class="page-intro">Send money within your team. Sent transfers appear below; confirm received money on the Dashboard.</p>

    <div class="card">
      <h2>ðŸ”„ New Transfer</h2>
      <form id="transferFundsForm" onsubmit="window.executeFundsTransfer(event)">
        <div class="form-stack">
          <div id="trMemberFilters" class="transfer-filter-row" style="display:none;">
            <label class="checkbox-inline"><input type="checkbox" id="trShowMembers" onchange="window.onTransferDestFilterChange()"> Include member wallets</label>
          </div>
          <div id="trOtmFilters" class="transfer-filter-row" style="display:none;">
            <label class="checkbox-inline"><input type="checkbox" id="trShowTeamPeers" onchange="window.onTransferDestFilterChange()"> Team bucket</label>
            <label class="checkbox-inline"><input type="checkbox" id="trShowMemberPeers" onchange="window.onTransferDestFilterChange()"> Member wallets</label>
          </div>

          <div id="trCrossTeamSection" class="transfer-filter-row" style="display:none;">
            <label class="checkbox-inline"><input type="checkbox" id="trCrossTeam" onchange="window.onCrossTeamToggle()"> Send to member personal wallet (cross-team)</label>
          </div>
          <div id="trCrossTeamFields" style="display:none;">
            <div class="form-grid-row form-grid-row--transfer-buckets">
              <div class="form-group"><label>Member *</label><select id="trCrossMemberId"><option value="">Select member</option></select></div>
              <div class="form-group"><label>Budget *</label><select id="trCrossBudgetId"><option value="">Select budget</option></select></div>
            </div>
          </div>

          <div class="form-grid-row form-grid-row--transfer-buckets">
            <div class="form-group"><label>Transfer Date</label><input type="date" id="trDate" required></div>
            <div class="form-group"><label>Source Bucket</label><select id="trSourceBucketId" required onchange="window.onTransferBucketChange()"><option value="">Loadingâ€¦</option></select><span class="form-field-hint" id="trSourceCurrency">Currency: â€”</span></div>
            <div class="form-group"><label>Destination Bucket</label><select id="trDestBucketId" required onchange="window.onTransferBucketChange()"><option value="">Loadingâ€¦</option></select><span class="form-field-hint" id="trDestCurrency">Currency: â€”</span></div>
          </div>

          <div class="form-grid-row form-grid-row--transfer-amount">
            <div class="form-group"><label>Amount <span id="trAmountCurrencyLabel" style="font-weight:600;color:var(--primary);">(USD)</span></label><input type="number" class="input-amount" id="trAmount" step="0.01" placeholder="0.00" required oninput="window.onTransferAmountChange()"></div>
            <div class="form-group"><label id="trRateLabel">Rate (1 USD = ?)</label><input type="number" class="input-rate" id="trRate" step="any" min="0.000001" placeholder="95.4" oninput="window.onTransferAmountChange()"></div>
            <div class="form-group"><label>Converted <span id="trConvertedCurrencyLabel" style="font-weight:600;color:var(--primary);"></span></label><input type="number" class="input-amount" id="trConvertedAmount" step="0.01" readonly style="background:#f3f4f6;"><span class="form-field-hint" id="trConvertedLabel">â€”</span></div>
          </div>
          <div class="form-group">
            <label>Memo * <span class="form-hint">(max ${MEMO_MAX_LENGTH} chars)</span></label>
            <input type="text" id="trMemo" maxlength="${MEMO_MAX_LENGTH}" required placeholder="Reason for transfer">
          </div>
        </div>
        <div id="trValidationError" class="form-error-inline" style="display:none;"></div>
        <button type="submit" id="trSubmitBtn" class="btn-block">Send Transfer</button>
      </form>
      ${lead ? '<p class="form-hint">Team operational transfers complete immediately. Member/cross-team transfers need confirmation. Cross-team requires OHF approval then receiver confirm.</p>' : '<p class="form-hint">Transfers to team or members wait for confirmation. You can only send from your personal wallet.</p>'}
    </div>

    <div class="card">
      <h2>ðŸ’° Pay Approved Budget</h2>
      <p class="page-intro">Final step of the budget workflow: move funds from an Org bucket to the team / OPH buckets for budgets that are CAO-approved and FIH-approved for payment. The team lead confirms receipt.</p>
      <div class="form-stack">
        <div class="form-grid-row form-grid-row--transfer-buckets">
          <div class="form-group"><label>Team *</label><select id="payTeamId" onchange="window.onPayTeamChange()"><option value="">Select team</option></select></div>
          <div class="form-group"><label>Transfer Date</label><input type="date" id="payDate"></div>
        </div>
        <div id="payBudgetRows"><p class="empty-state">Select a team to see its budgets ready for payment.</p></div>
        <div class="form-grid-row">
          <div class="form-group">
            <label style="font-weight: 600; font-size: 0.85rem;">Proof of Transfer (optional)</label>
            <div class="attachment-upload-zone" onclick="document.getElementById('payProofFile').click()" style="border: 1px dashed var(--border); border-radius: 4px; padding: 12px; text-align: center; cursor: pointer; color: var(--text-secondary); background: var(--bg-secondary); font-size: 0.85rem;">
              <span id="payProofLabel">ðŸ“Ž Click to upload proof of funds transfer</span>
              <input type="file" id="payProofFile" onchange="window.onPayProofChange(this)" style="display: none;" accept="image/*,application/pdf">
            </div>
          </div>
          <div class="form-group">
            <label>Memo * <span class="form-hint">(max ${MEMO_MAX_LENGTH} chars)</span></label>
            <input type="text" id="payMemo" maxlength="${MEMO_MAX_LENGTH}" required placeholder="e.g. KMOF payment">
          </div>
        </div>
        <div id="payValidationError" class="form-error-inline" style="display:none;"></div>
        <button type="button" id="paySubmitBtn" class="btn-block success" onclick="window.executeBudgetPayments()">Send Transfer</button>
      </div>
    </div>

    <div class="card">
      <div class="transfer-list-header">
        <h2>ðŸ“¤ Sent Transfers</h2>
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
      <div class="table-container show-desktop">
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
            <tr><td colspan="7" class="empty-state">Loadingâ€¦</td></tr>
          </tbody>
        </table>
      </div>
      <div id="trSentMobileList" class="show-mobile data-card-list"></div>
    </div>
  `;
}

export async function initTransferFundsPage() {
  if (!state.canTransferFunds) return;

  const d = document.getElementById('trDate');
  if (d) d.value = new Date().toISOString().split('T')[0];

  await loadTeamBuckets();
  await loadExchangeRates();
  if (isTeamLeadAccess(state)) {
    await Promise.all([loadTeamMembers(), loadTeamBudgets()]);
    populateCrossTeamSelects();
  }

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
  window.onCrossTeamToggle = onCrossTeamToggle;
  window.executeFundsTransfer = executeFundsTransfer;
  window.refreshSentTransfersList = refreshSentTransfersList;
  window.cancelSentTransfer = cancelSentTransfer;
  window.executeBudgetPayments = executeBudgetPayments;

  // Pay Approved Budget card
  await loadPaySourceBuckets();
  await loadPayTeams();
  const payDateEl = document.getElementById('payDate');
  if (payDateEl) payDateEl.value = new Date().toISOString().split('T')[0];

  onTransferBucketChange();
  await refreshSentTransfersList();
}

function onTransferDestFilterChange() {
  const lead = isTeamLeadAccess(state);
  const globalAdmin = hasAnyGlobalFinanceRole();
  if (lead && !globalAdmin) {
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
  const mobile = document.getElementById('trSentMobileList');
  if (!tbody) return;
  const teamId = state.currentTeam?.team_id;
  const statusFilter = document.getElementById('trStatusFilter')?.value || '';

  try {
    sentTransfersCache = await fetchSentTransfers(teamId, state.user?.id, { statusFilter });

    if (!sentTransfersCache.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No sent transfers yet.</td></tr>';
      if (mobile) mobile.innerHTML = '<p class="empty-state">No sent transfers yet.</p>';
      return;
    }

    let mobileHtml = '';
    tbody.innerHTML = sentTransfersCache.map(t => {
      const src = getBucketById(t.from_bucket_id);
      const dest = getBucketById(t.to_bucket_id);
      const badge = getTransferStatusBadge(t.status);
      const canCancel = t.status === TRANSFER_STATUS.PENDING;
      const amountStr = `${parseFloat(t.amount).toFixed(2)} ${escapeHtml(t.currency || '')}`;

      mobileHtml += `
        <article class="data-card data-card--compact">
          <div class="data-card-top">
            <span class="data-card-title">${escapeHtml(dest?.name || 'â€”')}</span>
            <span class="badge ${badge.class}">${badge.label}</span>
          </div>
          <div class="data-card-row">
            <span class="data-card-row-label">Amount</span>
            <span class="data-card-row-value">${amountStr}</span>
          </div>
          <div class="data-card-row">
            <span class="data-card-row-label">From</span>
            <span class="data-card-row-value">${escapeHtml(src?.name || 'â€”')}</span>
          </div>
          <div class="data-card-row">
            <span class="data-card-row-label">Date</span>
            <span class="data-card-row-value">${escapeHtml(t.date)}</span>
          </div>
          ${t.description ? `<div class="data-card-row"><span class="data-card-row-label">Memo</span><span class="data-card-row-value">${escapeHtml(t.description)}</span></div>` : ''}
          ${canCancel ? `<div class="data-card-actions"><button type="button" class="danger small" onclick="window.cancelSentTransfer('${t.id}')">Cancel</button></div>` : ''}
        </article>
      `;

      return `
        <tr>
          <td data-label="Date">${escapeHtml(t.date)}</td>
          <td data-label="From">${escapeHtml(src?.name || 'â€”')}</td>
          <td data-label="To">${escapeHtml(dest?.name || 'â€”')}</td>
          <td data-label="Amount">${amountStr}</td>
          <td data-label="Memo">${escapeHtml(t.description || '')}</td>
          <td data-label="Status"><span class="badge ${badge.class}">${badge.label}</span></td>
          <td data-label="Actions" class="action-buttons">
            ${canCancel ? `<button type="button" class="danger small" onclick="window.cancelSentTransfer('${t.id}')">Cancel</button>` : 'â€”'}
          </td>
        </tr>
      `;
    }).join('');
    if (mobile) mobile.innerHTML = mobileHtml;
  } catch (err) {
    console.error('Load sent transfers:', err);
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state" style="color:#dc3545;">${escapeHtml(err.message)}</td></tr>`;
    if (mobile) mobile.innerHTML = `<p class="empty-state" style="color:#dc3545;">${escapeHtml(err.message)}</p>`;
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
    srcCurrencyEl.textContent = 'Currency: â€”';
    if (amountLabel) amountLabel.textContent = '(USD)';
  }

  if (destBucket) {
    destCurrencyEl.textContent = `Currency: ${destBucket.currency}`;
    if (convertedCurrencyLabel) convertedCurrencyLabel.textContent = `(${destBucket.currency})`;
  } else {
    destCurrencyEl.textContent = 'Currency: â€”';
    if (convertedCurrencyLabel) convertedCurrencyLabel.textContent = '';
  }

  if (srcBucket && destBucket) {
    const srcCurr = srcBucket.currency || 'USD';
    const destCurr = destBucket.currency || 'USD';

    if (srcCurr === destCurr) {
      if (rateInput) rateInput.value = '1';
      if (rateLabel) rateLabel.textContent = 'Exchange Rate (1 USD = 1 USD)';
      if (convertedInput) convertedInput.value = '';
      if (convertedLabel) convertedLabel.textContent = 'Same currency â€” no conversion needed';
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
    if (convertedLabel) convertedLabel.textContent = 'â€”';
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

  const crossTeam = !!document.getElementById('trCrossTeam')?.checked;
  const srcId = document.getElementById('trSourceBucketId').value;
  let destId = document.getElementById('trDestBucketId').value;
  const crossMemberId = document.getElementById('trCrossMemberId')?.value;
  const crossBudgetId = document.getElementById('trCrossBudgetId')?.value;
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
  if (!srcId) {
    showError('Select a source bucket.');
    return;
  }
  if (amount <= 0) {
    showError('Amount must be greater than zero.');
    return;
  }

  const srcBucket = getBucketById(srcId);
  if (!srcBucket) {
    showError('Invalid source bucket.');
    return;
  }

  const senderIsOtl = isTeamLeadAccess(state);
  let destBucket = null;
  let crossWallet = null;
  let flow = null;

  if (crossTeam) {
    if (!senderIsOtl) {
      showError('Only team leads can send cross-team transfers.');
      return;
    }
    if (!crossMemberId || !crossBudgetId) {
      showError('Select member and budget for cross-team transfer.');
      return;
    }
    if (!isOperationalBucket(srcBucket)) {
      showError('Cross-team transfers must come from a team operational bucket.');
      return;
    }

    const member = teamMembersCache.find(u => u.id === crossMemberId);
    crossWallet = await getMemberPersonalWallet(crossMemberId);
    if (!crossWallet) {
      try {
        await ensurePersonalTeamForUser(crossMemberId, member?.name || member?.email, state.user?.id);
        crossWallet = await getMemberPersonalWallet(crossMemberId);
      } catch (walletErr) {
        showError(walletErr.message || 'Could not load member personal wallet.');
        return;
      }
    }
    if (!crossWallet?.bucket) {
      showError('Member personal wallet not found.');
      return;
    }

    destBucket = crossWallet.bucket;
    destId = destBucket.id;
    flow = {
      flow: TRANSFER_FLOW.CROSS_TEAM_PERSONAL,
      status: TRANSFER_STATUS.PENDING,
      receiver_user_id: crossMemberId,
      receiver_kind: 'member'
    };
  } else {
    if (!destId || srcId === destId) {
      showError('Select different source and destination buckets.');
      return;
    }
    destBucket = getBucketById(destId);
    if (!destBucket) {
      showError('Invalid destination bucket.');
      return;
    }
    flow = classifyTransferFlow(srcBucket, destBucket, senderIsOtl);
  }

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
    dest_team_id: crossTeam ? crossWallet.team.id : null,
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
    pending_step: crossTeam ? PENDING_STEP.OHF : null,
    linked_budget_id: crossTeam ? crossBudgetId : null,
    created_by: state.user?.id,
    created_at: new Date().toISOString(),
    is_deleted: false
  };

  if (flow.status === TRANSFER_STATUS.ACCEPTED) {
    transferPayload.accepted_at = new Date().toISOString();
  }

  const btn = document.getElementById('trSubmitBtn');
  btn.disabled = true;
  btn.textContent = 'Sendingâ€¦';

  try {
    if (flow.status === TRANSFER_STATUS.ACCEPTED) {
      await applyAcceptedTransferBalances(transferPayload, srcBucket, destBucket, exchangeRatesCache);
    }

    const result = await sbInsert('transfers', transferPayload);
    if (result?.error) throw new Error(result.error.message);

    const saved = result.data?.[0] || transferPayload;
    await auditLog('INSERT', saved.id, null, saved);

    if (flow.status === TRANSFER_STATUS.PENDING) {
      if (crossTeam) {
        const approvalReq = await createTransferApprovalRequest(saved);
        if (!approvalReq) {
          showToast('Transfer sent â€” approval tracking needs a request alias in My Profile', 'warning');
        }
      }
      showToast(crossTeam ? 'Cross-team transfer sent â€” awaiting OHF approval' : 'Transfer sent â€” waiting for confirmation', 'success');
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

// ==================== PAY APPROVED BUDGET (FIH/FIP payment) ====================
let payTeamsCache = [];
let payBudgetsCache = [];
let payDestBucketsCache = [];
let paySourceBucketsCache = [];
let payProof = { key: null, name: null };

function isPaymentUser() {
  return hasAnyGlobalFinanceRole() || state.user?.role === 'admin';
}

async function loadPaySourceBuckets() {
  const select = document.getElementById('paySourceBucketId');
  try {
    const { data, error } = await supabaseClient
      .from('buckets')
      .select('id, name, team_id, currency, balance, is_org_level, owner_user_id')
      .eq('is_org_level', true)
      .eq('is_deleted', false)
      .order('name');
    paySourceBucketsCache = error ? [] : (data || []);
    if (select) {
      select.innerHTML = '<option value="">Select source</option>';
      paySourceBucketsCache.forEach(b => {
        select.innerHTML += `<option value="${b.id}" data-currency="${b.currency}">${escapeHtml(b.name)} (${b.currency})</option>`;
      });
    }
  } catch (err) {
    console.warn('loadPaySourceBuckets:', err.message);
  }
}

async function loadPayTeams() {
  const select = document.getElementById('payTeamId');
  if (!select) return;
  if (isPaymentUser()) {
    try {
      // NOTE: teams table has no is_deleted column; exclude personal teams instead.
      const { data, error } = await supabaseClient
        .from('teams')
        .select('id, name')
        .eq('is_personal_team', false)
        .order('name');
      payTeamsCache = error || !data ? [] : (data || []).map(t => ({ id: t.id, name: t.name }));
    } catch {
      payTeamsCache = [];
    }
  } else {
    // state.teams entries are shaped { team_id, team_name }
    payTeamsCache = (state.teams || []).map(t => ({ id: t.team_id || t.id, name: t.team_name || t.name }));
  }
  select.innerHTML = '<option value="">Select team</option>' +
    payTeamsCache
      .filter(t => t.id)
      .map(t => `<option value="${t.id}">${escapeHtml(t.name || '')}</option>`).join('');
}

function payTeamName(teamId) {
  return payTeamsCache.find(t => t.id === teamId)?.name || '';
}

async function loadPayBudgets(teamId) {
  if (!teamId) return [];
  const { data, error } = await supabaseClient
    .from('budget_plans')
    .select('id, name, budget_type, team_id, status, approval_status, total_amount, approved_amount, paid_amount')
    .eq('team_id', teamId)
    .eq('is_deleted', false)
    .eq('approval_status', 'FIH-APPROVED')
    .neq('status', 'archive')
    .neq('status', 'archived')
    .order('name');
  if (error) throw error;
  return data || [];
}

async function loadPayDestBuckets(teamId) {
  if (!teamId) return [];
  // Buckets of the selected team + operational buckets of teams whose lead is an OPH
  const teamIds = new Set([teamId]);
  try {
    const { data: memberships } = await supabaseClient
      .from('user_teams')
      .select('team_id, users:user_id(id, role)')
      .eq('access_level', 'lead');
    (memberships || []).forEach(m => {
      if (m.users?.role === 'oph') teamIds.add(m.team_id);
    });
  } catch (err) {
    console.warn('OPH team lookup failed:', err.message);
  }
  const { data, error } = await supabaseClient
    .from('buckets')
    .select('id, name, team_id, currency, is_org_level, owner_user_id')
    .in('team_id', [...teamIds])
    .eq('is_deleted', false);
  if (error) throw error;
  return (data || []).filter(b => !b.is_org_level && !b.owner_user_id);
}

async function onPayTeamChange() {
  const teamId = document.getElementById('payTeamId')?.value;
  const rowsEl = document.getElementById('payBudgetRows');
  payBudgetsCache = [];
  payDestBucketsCache = [];
  if (!teamId || teamId === 'undefined' || !rowsEl) {
    if (rowsEl) rowsEl.innerHTML = '<p class="empty-state">Select a team to see its budgets ready for payment.</p>';
    return;
  }
  rowsEl.innerHTML = '<p class="empty-state">Loadingâ€¦</p>';
  try {
    const [budgets, destBuckets] = await Promise.all([loadPayBudgets(teamId), loadPayDestBuckets(teamId)]);
    await loadPaySourceBuckets();
    payBudgetsCache = budgets;
    payDestBucketsCache = destBuckets;
    renderPayBudgetRows();
  } catch (err) {
    rowsEl.innerHTML = `<p class="empty-state" style="color:#dc3545;">${escapeHtml(err.message)}</p>`;
  }
}

function renderPayBudgetRows() {
  const rowsEl = document.getElementById('payBudgetRows');
  if (!rowsEl) return;
  if (!payBudgetsCache.length) {
    rowsEl.innerHTML = '<p class="empty-state">No FIH-approved budgets awaiting payment for this team.</p>';
    return;
  }
  const destOptions = (selected) => {
    let html = '<option value="">Select destination bucket</option>';
    let lastTeam = null;
    payDestBucketsCache.forEach(b => {
      if (b.team_id !== lastTeam) {
        html += `<option disabled>â€” ${escapeHtml(payTeamName(b.team_id) || 'Team')} â€”</option>`;
        lastTeam = b.team_id;
      }
      html += `<option value="${b.id}" ${b.id === selected ? 'selected' : ''}>${escapeHtml(b.name)} (${b.currency})</option>`;
    });
    return html;
  };

  const sourceOptions = (selected) => {
    let html = '<option value="">Select source bucket</option>';
    paySourceBucketsCache.forEach(b => {
      html += `<option value="${b.id}" ${b.id === selected ? 'selected' : ''}>${escapeHtml(b.name)} (${b.currency})</option>`;
    });
    return html;
  };

  rowsEl.innerHTML = payBudgetsCache.map(b => {
    const approved = Number(b.approved_amount ?? b.total_amount ?? 0);
    const paid = Number(b.paid_amount ?? 0);
    const remaining = Math.max(0, approved - paid);
    return `
      <div class="pay-budget-row" data-budget-id="${b.id}" data-remaining="${remaining}" style="border:1px solid var(--border); border-radius:8px; padding:12px; margin-bottom:12px; background: var(--bg-secondary, rgba(0,0,0,0.03));">
        <div style="font-weight:600; margin-bottom:10px;">${escapeHtml(b.name)} <span class="form-hint">(${escapeHtml(b.budget_type || '')})</span></div>
        <div class="form-grid-row form-grid-row--transfer-buckets">
          <div class="form-group">
            <label>Approved (USD)</label>
            <input type="number" value="${approved.toFixed(2)}" readonly style="background:#f3f4f6;">
          </div>
          <div class="form-group">
            <label>Remaining (USD)</label>
            <input type="number" value="${remaining.toFixed(2)}" readonly style="background:#f3f4f6;">
          </div>
          <div class="form-group">
            <label>Transfer Amount (USD) *</label>
            <input type="number" class="pay-amount" step="0.01" min="0" max="${remaining.toFixed(2)}" placeholder="0.00">
          </div>
          <div class="form-group">
            <label>From Bucket (Org) *</label>
            <select class="pay-source">${sourceOptions()}</select>
          </div>
          <div class="form-group">
            <label>To Bucket (team / OPH) *</label>
            <select class="pay-dest">${destOptions()}</select>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

window.onPayTeamChange = onPayTeamChange;

window.onPayProofChange = async function(input) {
  const file = input.files?.[0];
  if (!file) return;
  const label = document.getElementById('payProofLabel');
  try {
    if (label) label.textContent = `â³ Uploading ${file.name}â€¦`;
    const { objectKey } = await uploadReceipt(file);
    payProof = { key: objectKey, name: file.name };
    if (label) label.textContent = `ðŸ“Ž ${file.name} (uploaded)`;
  } catch (err) {
    payProof = { key: null, name: null };
    if (label) label.textContent = 'ðŸ“Ž Upload failed â€” click to retry';
    showToast(err.message || 'Upload failed', 'error');
  }
};

window.executeBudgetPayments = async function() {
  const errorEl = document.getElementById('payValidationError');
  const hideError = () => { if (errorEl) errorEl.style.display = 'none'; };
  hideError();

  const teamId = document.getElementById('payTeamId')?.value;
  const date = document.getElementById('payDate')?.value || new Date().toISOString().split('T')[0];
  const memo = document.getElementById('payMemo')?.value?.trim() || 'Budget payment';

  if (!teamId) return showToast('Select a team.', 'warning');

  const payments = [];
  document.querySelectorAll('#payBudgetRows .pay-budget-row').forEach(row => {
    const amount = parseFloat(row.querySelector('.pay-amount')?.value) || 0;
    const destId = row.querySelector('.pay-dest')?.value;
    const srcId = row.querySelector('.pay-source')?.value;
    if (amount > 0) {
      payments.push({
        budgetId: row.dataset.budgetId,
        amount,
        destId,
        srcId,
        remaining: parseFloat(row.dataset.remaining) || 0
      });
    }
  });
  if (!payments.length) return showToast('Enter a transfer amount for at least one budget.', 'warning');

  for (const p of payments) {
    if (!p.srcId) return showToast('Select a source (From) bucket for every budget with an amount.', 'warning');
    if (!p.destId) return showToast('Select a destination (To) bucket for every budget with an amount.', 'warning');
    if (p.srcId === p.destId) return showToast('Source and destination buckets must be different.', 'warning');
    if (p.amount > p.remaining + 0.005) return showToast('Transfer amount cannot exceed the remaining approved amount.', 'warning');
    if (!paySourceBucketsCache.find(b => b.id === p.srcId)) return showToast('Invalid source bucket.', 'error');
    if (!payDestBucketsCache.find(b => b.id === p.destId)) return showToast('Invalid destination bucket.', 'error');
    const srcBucket = paySourceBucketsCache.find(b => b.id === p.srcId);
    const destBucket = payDestBucketsCache.find(b => b.id === p.destId);
    // Payment transfers are always org -> team (operational) bucket
    if (srcBucket.is_org_level !== true) return showToast('Source bucket must be an Org-level bucket.', 'warning');
    if (destBucket.is_org_level === true || destBucket.owner_user_id) return showToast('Destination bucket must be a team operational bucket.', 'warning');
  }

  // Receiver: a lead of the selected team who will confirm receipt
  let receiverId = null;
  try {
    const { data: leads } = await supabaseClient
      .from('user_teams')
      .select('user_id, access_level')
      .eq('team_id', teamId)
      .in('access_level', ['lead', 'admin', 'oht']);
    receiverId = (leads || []).find(l => l.user_id !== state.user?.id)?.user_id || (leads || [])[0]?.user_id || null;
  } catch (err) {
    console.warn('Lead lookup failed:', err.message);
  }

  const btn = document.getElementById('paySubmitBtn');

  btn.disabled = true;
  btn.textContent = 'Sending…';
  try {
    for (const p of payments) {
      const budget = payBudgetsCache.find(b => b.id === p.budgetId);
      const srcBucket = paySourceBucketsCache.find(b => b.id === p.srcId);
      const destBucket = payDestBucketsCache.find(b => b.id === p.destId);
      const payload = {
        id: crypto.randomUUID(),

        team_id: srcBucket.team_id,
        dest_team_id: teamId,
        date,
        from_bucket_id: srcBucket.id,
        to_bucket_id: destBucket.id,
        amount: p.amount,
        rate: 1,
        currency: srcBucket.currency || 'USD',
        dest_amount: p.amount,
        dest_currency: destBucket.currency || 'USD',
        description: memo,
        status: 'PENDING',
        flow_type: 'org_to_team',
        receiver_user_id: receiverId,
        receiver_kind: 'lead',
        pending_step: 'receiver',
        linked_budget_id: p.budgetId,
        attachment_url: payProof.key,
        attachment_name: payProof.name,
        created_by: state.user?.id,
        created_at: new Date().toISOString(),
        is_deleted: false
      };
      const result = await supabaseClient.rpc('insert_budget_payment_transfer', {
        p_id: payload.id,
        p_team_id: srcBucket.team_id,
        p_dest_team_id: teamId,
        p_date: date,
        p_from_bucket_id: srcBucket.id,
        p_to_bucket_id: destBucket.id,
        p_amount: p.amount,
        p_rate: 1,
        p_currency: srcBucket.currency || 'USD',
        p_dest_amount: p.amount,
        p_dest_currency: destBucket.currency || 'USD',
        p_description: memo,
        p_receiver_user_id: receiverId,
        p_linked_budget_id: p.budgetId,
        p_attachment_url: payProof.key,
        p_attachment_name: payProof.name
      });
      if (result?.error) throw new Error(result.error.message);
      await auditLog('INSERT', payload.id, null, payload);

      // Record the payment on the budget (FIH/FIP authorized via trigger)
      const newPaid = Number(budget?.paid_amount ?? 0) + p.amount;
      const { error: paidErr } = await supabaseClient
        .from('budget_plans')
        .update({ paid_amount: newPaid, funding_notes: memo })
        .eq('id', p.budgetId);
      if (paidErr) throw new Error('Transfer created but payment could not be recorded on the budget: ' + paidErr.message);
    }
    showToast(`Payment transfer${payments.length > 1 ? 's' : ''} sent â€” the team lead will confirm receipt.`, 'success');
    payProof = { key: null, name: null };
    const proofLabel = document.getElementById('payProofLabel');
    if (proofLabel) proofLabel.textContent = 'ðŸ“Ž Click to upload proof of funds transfer';
    const memoEl = document.getElementById('payMemo');
    if (memoEl) memoEl.value = '';
    await onPayTeamChange();
    await refreshSentTransfersList();
  } catch (err) {
    console.warn('Payment transfer failed:', err?.message || err);
    showToast(err.message || 'Payment failed', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send Transfer';
  }
};

// Dashboard hooks
export async function acceptTransferFromDashboard(transferId) {
  try {
    await acceptTransfer(transferId);
    showToast('Transfer accepted â€” balances updated', 'success');
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

/* ========== VIEW TRANSFERS PAGE (Income → View Transfers) ========== */

let viewTransfersCache = [];
let viewBucketsCache = [];
let viewTeamsCache = [];
let viewBudgetOptionsCache = [];

export function getViewTransfersPage() {
  return `
    <h1 class="page-title">View Transfers</h1>
    <p class="page-intro">All transfers across teams — filter by date range, team, budget, buckets or amount.</p>

    <div class="card">
      <h2>🔍 Filters</h2>
      <div class="form-grid-row form-grid-row--transfer-buckets">
        <div class="form-group"><label>From Date</label><input type="date" id="vtDateFrom" onchange="window.applyViewTransfersFilters()"></div>
        <div class="form-group"><label>To Date</label><input type="date" id="vtDateTo" onchange="window.applyViewTransfersFilters()"></div>
        <div class="form-group"><label>Team</label><select id="vtTeam" onchange="window.applyViewTransfersFilters()"><option value="">All Teams</option></select></div>
      </div>
      <div class="form-grid-row form-grid-row--transfer-buckets">
        <div class="form-group"><label>Budget Search</label><input type="text" id="vtBudgetSearch" placeholder="Search budget..." oninput="window.onViewBudgetSearchInput()" style="margin-bottom:0;"></div>
        <div class="form-group"><label>Budget</label><select id="vtBudget" onchange="window.applyViewTransfersFilters()"><option value="">All Budgets</option></select></div>
      </div>
      <div class="form-grid-row form-grid-row--transfer-buckets">
        <div class="form-group"><label>From Bucket</label><select id="vtFromBucket" onchange="window.applyViewTransfersFilters()"><option value="">All Buckets</option></select></div>
        <div class="form-group"><label>To Bucket</label><select id="vtToBucket" onchange="window.applyViewTransfersFilters()"><option value="">All Buckets</option></select></div>
        <div class="form-group"><label>Min Amount (USD)</label><input type="number" id="vtMinAmount" min="0" step="0.01" placeholder="e.g. 100" onchange="window.applyViewTransfersFilters()"></div>
      </div>
      <div style="text-align:right;">
        <button class="sq-btn secondary" onclick="window.clearViewTransfersFilters()">Clear Filters</button>
      </div>
    </div>

    <div class="card">
      <h2>📋 Transfers</h2>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Ref</th><th>Date</th><th>Team</th><th>Budget</th><th>From</th><th>To</th><th>Amount</th><th>Status</th></tr></thead>
          <tbody id="vtListBody"><tr><td colspan="8" class="empty-state">Loading…</td></tr></tbody>
        </table>
      </div>
    </div>`;
}



export async function initViewTransfersPage() {
  try {
    const [bucketRes, teamRes] = await Promise.all([
      supabaseClient.from('buckets').select('id,name,team_id,is_org_level,owner_user_id').eq('is_deleted', false),
      supabaseClient.from('teams').select('id,name').eq('is_personal_team', false)
    ]);
    if (bucketRes.error) throw bucketRes.error;
    if (teamRes.error) throw teamRes.error;
    viewBucketsCache = bucketRes.data || [];
    viewTeamsCache = (teamRes.data || []).map(t => ({ id: t.id, name: t.name }));

    const role = String(state.user?.role || '').toLowerCase();
    const isFin = ['admin', 'caoh', 'oh', 'ceo', 'fin', 'fip', 'fih'].includes(role);
    let q = supabaseClient.from('transfers').select('*').eq('is_deleted', false).order('date', { ascending: false }).limit(500);
    if (!isFin) {
      const myTeamId = state.currentTeam?.team_id;
      if (myTeamId) q = q.or(`team_id.eq.${myTeamId},dest_team_id.eq.${myTeamId}`);
    }
    const { data, error } = await q;
    if (error) throw error;
    viewTransfersCache = data || [];

    const teamSel = document.getElementById('vtTeam');
    if (teamSel) teamSel.innerHTML = '<option value="">All Teams</option>' + viewTeamsCache.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
    const bucketOpts = '<option value="">All Buckets</option>' + viewBucketsCache.map(b => {
      const team = viewTeamsCache.find(t => t.id === b.team_id);
      const label = `${b.is_org_level ? '🌍 ' : ''}${b.name}${team ? ` (${team.name})` : (b.owner_user_id ? ' (personal)' : '')}`;
      return `<option value="${b.id}">${escapeHtml(label)}</option>`;
    }).join('');
    const fromSel = document.getElementById('vtFromBucket');
    const toSel = document.getElementById('vtToBucket');
    if (fromSel) fromSel.innerHTML = bucketOpts;
    if (toSel) toSel.innerHTML = bucketOpts;

    const budgetIds = [...new Set(viewTransfersCache.map(t => t.linked_budget_id).filter(Boolean))];
    let budgetOpts = '<option value="">All Budgets</option>';
    viewBudgetOptionsCache = [];
    if (budgetIds.length) {
      const { data: budgets, error: bErr } = await supabaseClient.from('budget_plans').select('id,name').in('id', budgetIds).order('name');
      if (bErr) throw bErr;
      viewBudgetOptionsCache = budgets || [];
      budgetOpts += viewBudgetOptionsCache.map(b => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join('');
    }
    const bSel = document.getElementById('vtBudget');
    if (bSel) bSel.innerHTML = budgetOpts;

    applyViewTransfersFilters();
  } catch (err) {
    console.error('View transfers load:', err);
    showToast(err.message || 'Failed to load transfers', 'error');
  }
}


function applyViewTransfersFilters() {
  const val = id => document.getElementById(id)?.value?.trim() || '';
  const dateFrom = val('vtDateFrom');
  const dateTo = val('vtDateTo');
  const teamId = val('vtTeam');
  const budgetId = val('vtBudget');
  const fromBucket = val('vtFromBucket');
  const toBucket = val('vtToBucket');
  const minAmount = parseFloat(val('vtMinAmount')) || 0;

  const rows = viewTransfersCache.filter(t => {
    if (dateFrom && (t.date || '') < dateFrom) return false;
    if (dateTo && (t.date || '') > dateTo) return false;
    if (teamId && t.team_id !== teamId && t.dest_team_id !== teamId) return false;
    if (budgetId && t.linked_budget_id !== budgetId) return false;
    if (fromBucket && t.from_bucket_id !== fromBucket) return false;
    if (toBucket && t.to_bucket_id !== toBucket) return false;
    if (minAmount && parseFloat(t.amount_usd || t.amount || 0) < minAmount) return false;
    return true;
  });

  renderViewTransfersRows(rows);
}
window.applyViewTransfersFilters = applyViewTransfersFilters;

function renderViewTransfersRows(rows) {
  const tbody = document.getElementById('vtListBody');
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No transfers match the filters.</td></tr>';
    return;
  }
  const teamName = id => viewTeamsCache.find(t => t.id === id)?.name || '—';
  const bucketName = id => viewBucketsCache.find(b => b.id === id)?.name || id || '—';
  const budgetName = id => (id ? (viewBudgetOptionsCache.find(b => b.id === id)?.name || 'Budget') : '—');
  const fmtAmt = t => `${parseFloat(t.amount || 0).toFixed(2)} ${t.currency || ''}${t.amount_usd != null ? ` ($${parseFloat(t.amount_usd).toFixed(2)})` : ''}`;
  const refOf = t => (t.id ? String(t.id).replace(/-/g, '').slice(0, 8).toUpperCase() : '—');
  tbody.innerHTML = rows.map(t => `<tr>
    <td title="${escapeHtml(t.id || '')}">${escapeHtml(refOf(t))}</td>
    <td>${escapeHtml(t.date || '—')}</td>
    <td>${escapeHtml(teamName(t.dest_team_id || t.team_id))}</td>
    <td>${escapeHtml(budgetName(t.linked_budget_id))}</td>
    <td>${escapeHtml(bucketName(t.from_bucket_id))}</td>
    <td>${escapeHtml(bucketName(t.to_bucket_id))}</td>
    <td>${escapeHtml(fmtAmt(t))}</td>
    <td>${getTransferStatusBadge(t.status)}</td>
  </tr>`).join('');
}

window.onViewBudgetSearchInput = function () {
  const searchQ = (document.getElementById('vtBudgetSearch')?.value || '').trim().toLowerCase();
  const sel = document.getElementById('vtBudget');
  if (!sel) return;
  const current = sel.value;
  const filtered = viewBudgetOptionsCache.filter(b => !searchQ || (b.name || '').toLowerCase().includes(searchQ));
  sel.innerHTML = '<option value="">All Budgets</option>' + filtered.map(b => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join('');
  if (current && filtered.some(b => b.id === current)) sel.value = current;
};

window.clearViewTransfersFilters = function () {
  ['vtDateFrom', 'vtDateTo', 'vtTeam', 'vtBudgetSearch', 'vtBudget', 'vtFromBucket', 'vtToBucket', 'vtMinAmount'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const sel = document.getElementById('vtBudget');
  if (sel) sel.innerHTML = '<option value="">All Budgets</option>' + viewBudgetOptionsCache.map(b => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join('');
  applyViewTransfersFilters();
};
