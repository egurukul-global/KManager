/* ========== APPROVAL PORTAL ========== */
import { state } from '../state.js';
import { supabaseClient } from '../db.js';
import { showToast, showConfirm, showPrompt } from '../components/toasts.js';
import { cardRow, setButtonLoading } from '../utils/uiHelpers.js';
import { approvalStatusBadge } from '../utils/approvalConstants.js';
import {
  userCanActOnRequest,
  canCancelRequest,
  getUserApprovalRoleCodes,
  clarifyRoleFromStatus
} from '../utils/approvalAccess.js';
import {
  fetchApprovalInboxRaw,
  filterApprovalInboxLocal,
  loadReconciliationRequestLines,
  approveAndSendRequest,
  rejectRequest,
  cancelRequest,
  clarifyRequest,
  replyClarification,
  approveAndSendBatch
} from '../utils/approvalEngine.js';
import { renderBudgetReviewHtml, normalizeBudgetPlan } from './budgets.js';

/** Full list loaded once; filters/search work on this cache. */
let inboxCache = [];
let inboxRows = [];
let selectedIds = new Set();
let rowCanActMap = new Map();
let myStepCodes = [];

const TYPE_LABELS = {
  budget: 'Budget',
  money_transfer: 'Money Transfer',
  reconciliation_adjustment: 'Reconciliation'
};

const STEP_OPTIONS = ['OPH', 'FIN', 'FIH', 'CAO'];

export function getApprovalPortalPage() {
  return `
    <div class="card filter-card">
      <div class="form-grid-row form-grid-row--portal-filters">
        <div class="form-group">
          <label>Team</label>
          <select id="portalTeamFilter">
            <option value="">All teams</option>
          </select>
        </div>
        <div class="form-group form-group--narrow">
          <label>Status</label>
          <select id="portalStatusFilter">
            <option value="active" selected>Active</option>
            <option value="all">All</option>
            <option value="closed">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <div class="form-group form-group--narrow">
          <label>Type</label>
          <select id="portalTypeFilter">
            <option value="all">All</option>
            <option value="budget">Budget</option>
            <option value="money_transfer">Transfer</option>
            <option value="reconciliation_adjustment">Recon</option>
          </select>
        </div>
        <div class="form-group form-group--narrow">
          <label>Step</label>
          <select id="portalStepFilter"></select>
        </div>
        <div class="form-group form-group--search">
          <label>Search</label>
          <input type="text" id="portalSearch" placeholder="Name or request #" onkeydown="if(event.key==='Enter')window.searchApprovalPortal()">
        </div>
        <div class="form-group form-group--action">
          <label>&nbsp;</label>
          <button type="button" onclick="window.searchApprovalPortal()">Search</button>
        </div>
      </div>
    </div>

    <div class="card" id="portalBatchBar" style="display:none;">
      <h3>Batch (<span id="portalSelectedCount">0</span>)</h3>
      <div class="btn-group">
        <button type="button" id="portalBatchApproveBtn" class="success" disabled onclick="window.portalBatchApprove(event)">Approve</button>
      </div>
    </div>

    <div class="card">
      <h2>Inbox</h2>
      <div class="table-container show-desktop">
        <table class="table-stack-mobile" id="portalInboxTable">
          <thead>
            <tr>
              <th><input type="checkbox" id="portalSelectAll" onchange="window.portalToggleSelectAll(this.checked)" title="Select all"></th>
              <th>Request</th>
              <th>Title</th>
              <th>Type</th>
              <th>Team</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Step</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="portalInboxTableBody">
            <tr><td colspan="9" class="empty-state">Loading…</td></tr>
          </tbody>
        </table>
      </div>
      <div id="portalInboxMobile" class="show-mobile data-card-list"></div>
    </div>

    <div id="approvalReviewModal" class="modal">
      <div class="modal-content" style="max-width:960px;">
        <button type="button" class="close-modal" onclick="window.portalCloseReviewModal()">&times;</button>
        <h2 id="approvalReviewModalTitle">Review</h2>
        <div id="approvalReviewModalBody"><p class="empty-state">Loading…</p></div>
        <div class="btn-group" style="margin-top:16px;">
          <button type="button" class="secondary" onclick="window.portalCloseReviewModal()">Close</button>
        </div>
      </div>
    </div>
  `;
}

export async function initApprovalPortalPage() {
  window.searchApprovalPortal = searchApprovalPortal;
  window.refreshApprovalPortal = searchApprovalPortal;
  window.portalToggleSelect = portalToggleSelect;
  window.portalToggleSelectAll = portalToggleSelectAll;
  window.portalOpenDetail = portalOpenReviewModal;
  window.portalCloseReviewModal = portalCloseReviewModal;
  window.portalAction = portalAction;
  window.portalBatchApprove = portalBatchApprove;

  populateTeamFilter();
  await setupStepFilter();
  applyDeepLinkFilters();
  try {
    await loadInboxFromServer();
    searchApprovalPortal();
    await openDeepLinkedRequest();
  } catch (err) {
    showToast(err.message || 'Failed to load approvals', 'error');
  }

  const modal = document.getElementById('approvalReviewModal');
  if (modal && !modal.dataset.bound) {
    modal.dataset.bound = '1';
    modal.addEventListener('click', (e) => {
      if (e.target === modal) portalCloseReviewModal();
    });
  }
}

async function setupStepFilter() {
  // All roles across teams — don't limit to the team switcher team
  myStepCodes = (await getUserApprovalRoleCodes(state.user?.id, null))
    .map(c => String(c).toUpperCase());

  const select = document.getElementById('portalStepFilter');
  if (!select) return;

  const primary = STEP_OPTIONS.find(s => myStepCodes.includes(s)) || null;

  let html = '<option value="mine">My step</option>';
  html += '<option value="all">All steps</option>';
  STEP_OPTIONS.forEach(s => {
    html += `<option value="${s}">${s}</option>`;
  });
  select.innerHTML = html;
  select.value = primary || 'mine';
}

/** Filters from a One Kailasa notification tap. */
function applyDeepLinkFilters() {
  const requestId = sessionStorage.getItem('ok_open_request_id');
  const teamId = sessionStorage.getItem('ok_open_team_id');
  if (!requestId && !teamId) return;

  const statusEl = document.getElementById('portalStatusFilter');
  const stepEl = document.getElementById('portalStepFilter');
  const teamEl = document.getElementById('portalTeamFilter');
  if (statusEl) statusEl.value = 'active';
  if (stepEl) stepEl.value = 'mine';
  if (teamEl && teamId) {
    const hasOption = [...teamEl.options].some(o => o.value === teamId);
    if (hasOption) teamEl.value = teamId;
    else teamEl.value = '';
  } else if (teamEl) {
    teamEl.value = '';
  }
}

async function openDeepLinkedRequest() {
  const requestId = sessionStorage.getItem('ok_open_request_id');
  sessionStorage.removeItem('ok_open_request_id');
  sessionStorage.removeItem('ok_open_team_id');
  if (!requestId) return;

  const row = inboxCache.find(r => r.id === requestId);
  if (row) {
    await portalOpenReviewModal(requestId);
    return;
  }

  // Widen filters once so a still-visible request isn't hidden by step/status
  const statusEl = document.getElementById('portalStatusFilter');
  const stepEl = document.getElementById('portalStepFilter');
  const teamEl = document.getElementById('portalTeamFilter');
  if (statusEl) statusEl.value = 'all';
  if (stepEl) stepEl.value = 'all';
  if (teamEl) teamEl.value = '';
  searchApprovalPortal();

  const widened = inboxCache.find(r => r.id === requestId);
  if (widened) {
    await portalOpenReviewModal(requestId);
    return;
  }

  showToast('This approval is not in your queue (it may already be done or assigned to another step).', 'warning');
}

function populateTeamFilter() {
  const select = document.getElementById('portalTeamFilter');
  if (!select) return;
  const current = select.value;
  select.innerHTML = '<option value="">All teams</option>';
  (state.teams || []).forEach(t => {
    select.innerHTML += `<option value="${t.team_id}">${t.team_name}</option>`;
  });
  select.value = current;
}

function getFilters() {
  return {
    statusFilter: document.getElementById('portalStatusFilter')?.value || 'active',
    typeFilter: document.getElementById('portalTypeFilter')?.value || 'all',
    stepFilter: document.getElementById('portalStepFilter')?.value || 'mine',
    search: document.getElementById('portalSearch')?.value || '',
    teamId: document.getElementById('portalTeamFilter')?.value || null,
    myStepCodes
  };
}

function rowIsActionable(row) {
  return rowCanActMap.get(row?.id) === true;
}

function countActionableSelected() {
  let count = 0;
  for (const id of selectedIds) {
    const row = inboxRows.find(r => r.id === id);
    if (rowIsActionable(row)) count++;
  }
  return count;
}

async function loadInboxFromServer() {
  const tableBody = document.getElementById('portalInboxTableBody');
  const mobileEl = document.getElementById('portalInboxMobile');
  if (tableBody) tableBody.innerHTML = '<tr><td colspan="9" class="empty-state">Loading…</td></tr>';
  if (mobileEl) mobileEl.innerHTML = '<p class="empty-state">Loading…</p>';

  inboxCache = await fetchApprovalInboxRaw();
  rowCanActMap = new Map();
  await Promise.all(inboxCache.map(async row => {
    rowCanActMap.set(row.id, await userCanActOnRequest(row));
  }));
}

function searchApprovalPortal() {
  const tableBody = document.getElementById('portalInboxTableBody');
  const mobileEl = document.getElementById('portalInboxMobile');
  if (!tableBody && !mobileEl) return;

  selectedIds = new Set();
  updateBatchBar();

  inboxRows = filterApprovalInboxLocal(inboxCache, getFilters(), rowCanActMap);

  if (!inboxRows.length) {
    if (tableBody) tableBody.innerHTML = '<tr><td colspan="9" class="empty-state">No requests match these filters.</td></tr>';
    if (mobileEl) mobileEl.innerHTML = '<p class="empty-state">No requests match these filters.</p>';
    return;
  }

  const rendered = inboxRows.map(row => renderInboxRow(row));
  if (tableBody) tableBody.innerHTML = rendered.map(r => r.table).join('');
  if (mobileEl) mobileEl.innerHTML = rendered.map(r => r.mobile).join('');

  const selectAll = document.getElementById('portalSelectAll');
  if (selectAll) selectAll.checked = false;
}

function rowActionButtons(row) {
  const canAct = rowIsActionable(row);
  const isMine = row.created_by === state.user?.id;
  const clarifyRole = clarifyRoleFromStatus(row.status);
  const canCancel = canCancelRequest(row);
  const buttons = [
    `<button type="button" class="small secondary" onclick="event.stopPropagation(); window.portalOpenDetail('${row.id}')">Open</button>`
  ];
  if (canAct) {
    buttons.push(`<button type="button" class="small success" onclick="event.stopPropagation(); window.portalAction(event,'approve','${row.id}')">Approve</button>`);
    buttons.push(`<button type="button" class="small secondary danger" onclick="event.stopPropagation(); window.portalAction(event,'reject','${row.id}')">Reject</button>`);
    buttons.push(`<button type="button" class="small secondary" onclick="event.stopPropagation(); window.portalAction(event,'clarify','${row.id}')">Clarify</button>`);
  }
  if (clarifyRole && (canAct || isMine)) {
    buttons.push(`<button type="button" class="small secondary" onclick="event.stopPropagation(); window.portalAction(event,'reply','${row.id}')">Reply</button>`);
  }
  if (canCancel) {
    buttons.push(`<button type="button" class="small secondary danger" onclick="event.stopPropagation(); window.portalAction(event,'cancel','${row.id}')">Cancel</button>`);
  }
  return buttons.join(' ');
}

function renderInboxRow(row) {
  const badge = approvalStatusBadge(row.status);
  const isMine = row.created_by === state.user?.id;
  const teamName = escapeHtml(row.teams?.name || '—');
  const typeLabel = TYPE_LABELS[row.request_type] || row.request_type;
  const amount = row.amount_usd != null ? `$${parseFloat(row.amount_usd).toFixed(2)}` : '—';
  const stepHint = row.current_role_code ? `Awaiting ${row.current_role_code}` : '—';
  const mineBadge = isMine ? ' <span class="badge badge-info">Yours</span>' : '';
  const yourTurn = rowIsActionable(row);
  const actions = rowActionButtons(row);

  const table = `
    <tr class="row-clickable" onclick="window.portalOpenDetail('${row.id}')">
      <td data-label="Select" onclick="event.stopPropagation()">
        <input type="checkbox" data-portal-id="${row.id}" onchange="window.portalToggleSelect('${row.id}', this.checked)">
      </td>
      <td data-label="Request"><strong>${row.request_number}</strong>${mineBadge}</td>
      <td data-label="Title">${escapeHtml(row.title || '—')}</td>
      <td data-label="Type">${typeLabel}</td>
      <td data-label="Team">${teamName}</td>
      <td data-label="Amount">${amount}</td>
      <td data-label="Status"><span class="badge ${badge.class}">${badge.label}</span></td>
      <td data-label="Step">${escapeHtml(stepHint)}${yourTurn ? ' <span class="badge badge-success">Your turn</span>' : ''}</td>
      <td data-label="Actions" class="action-buttons" onclick="event.stopPropagation()">${actions}</td>
    </tr>
  `;

  const mobile = `
    <article class="data-card data-card--compact data-card--clickable" onclick="window.portalOpenDetail('${row.id}')">
      <div class="data-card-top">
        <label class="checkbox-label" onclick="event.stopPropagation()">
          <input type="checkbox" data-portal-id="${row.id}" onchange="window.portalToggleSelect('${row.id}', this.checked)">
          <span class="data-card-title">${row.request_number}</span>
        </label>
        <span class="badge ${badge.class}">${badge.label}</span>
      </div>
      ${cardRow('Title', escapeHtml(row.title || '—'))}
      ${cardRow('Type', typeLabel)}
      ${cardRow('Team', teamName)}
      ${cardRow('Amount', amount)}
      ${cardRow('Step', `${escapeHtml(stepHint)}${yourTurn ? ' (Your turn)' : ''}`)}
      <div class="action-icon-group" style="margin-top:8px;" onclick="event.stopPropagation()">${actions}</div>
    </article>
  `;

  return { table, mobile };
}

function portalToggleSelect(id, checked) {
  if (checked) selectedIds.add(id);
  else selectedIds.delete(id);
  updateBatchBar();
}

function portalToggleSelectAll(checked) {
  selectedIds = new Set();
  document.querySelectorAll('[data-portal-id]').forEach(el => {
    el.checked = checked;
    if (checked) selectedIds.add(el.getAttribute('data-portal-id'));
  });
  updateBatchBar();
}

function updateBatchBar() {
  const bar = document.getElementById('portalBatchBar');
  const countEl = document.getElementById('portalSelectedCount');
  const btn = document.getElementById('portalBatchApproveBtn');
  const actionable = countActionableSelected();
  if (countEl) countEl.textContent = String(actionable);
  if (bar) bar.style.display = selectedIds.size ? '' : 'none';
  if (btn) btn.disabled = actionable === 0;
}

async function portalOpenReviewModal(id) {
  const row = inboxCache.find(r => r.id === id) || inboxRows.find(r => r.id === id);
  const modal = document.getElementById('approvalReviewModal');
  const titleEl = document.getElementById('approvalReviewModalTitle');
  const bodyEl = document.getElementById('approvalReviewModalBody');
  if (!row || !modal || !bodyEl) return;

  if (titleEl) titleEl.textContent = `${row.request_number} — ${row.title || 'Review'}`;
  bodyEl.innerHTML = '<p class="empty-state">Loading…</p>';
  modal.classList.add('active');

  try {
    if (row.request_type === 'budget' && row.budget_plan_id) {
      bodyEl.innerHTML = await buildBudgetReviewBody(row.budget_plan_id);
    } else if (row.request_type === 'money_transfer' && row.transfer_id) {
      bodyEl.innerHTML = await buildTransferReviewBody(row.transfer_id);
    } else if (row.request_type === 'reconciliation_adjustment') {
      bodyEl.innerHTML = await buildReconReviewBody(row.id, row);
    } else {
      bodyEl.innerHTML = `<p class="empty-state">No linked record to display for this request.</p>
        ${cardRow('Type', TYPE_LABELS[row.request_type] || row.request_type)}
        ${cardRow('Team', escapeHtml(row.teams?.name || '—'))}
        ${row.amount_usd != null ? cardRow('Amount', `$${parseFloat(row.amount_usd).toFixed(2)}`) : ''}`;
    }
  } catch (err) {
    console.error(err);
    bodyEl.innerHTML = `<p class="empty-state" style="color:#dc3545;">${escapeHtml(err.message || 'Failed to load record')}</p>`;
  }
}

function portalCloseReviewModal() {
  const modal = document.getElementById('approvalReviewModal');
  modal?.classList.remove('active');
  const bodyEl = document.getElementById('approvalReviewModalBody');
  if (bodyEl) bodyEl.innerHTML = '';
}

async function buildBudgetReviewBody(budgetPlanId) {
  let budget = (state.budgetPlans || []).find(b => b.id === budgetPlanId);
  if (budget) budget = normalizeBudgetPlan(budget);

  if (!budget) {
    // Prefer SECURITY DEFINER helper so FIN/FIH (role assignment only) can review
    const { data: rpcData, error: rpcErr } = await supabaseClient
      .rpc('get_budget_plan_for_review', { p_budget_plan_id: budgetPlanId });
    if (!rpcErr && rpcData?.length) {
      budget = normalizeBudgetPlan(rpcData[0]);
    } else {
      const { data, error } = await supabaseClient
        .from('budget_plans')
        .select('*')
        .eq('id', budgetPlanId)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Budget not found');
      budget = normalizeBudgetPlan(data);
    }
  }

  return renderBudgetReviewHtml(budget, { showActions: false });
}

async function buildTransferReviewBody(transferId) {
  let transfer = null;
  const { data: rpcData, error: rpcErr } = await supabaseClient
    .rpc('get_transfer_for_review', { p_transfer_id: transferId });
  if (!rpcErr && rpcData?.length) {
    transfer = rpcData[0];
  } else {
    const { data, error } = await supabaseClient
      .from('transfers')
      .select('*')
      .eq('id', transferId)
      .maybeSingle();
    if (error) throw error;
    transfer = data;
  }
  if (!transfer) throw new Error('Transfer not found');

  const bucketIds = [transfer.from_bucket_id, transfer.to_bucket_id].filter(Boolean);
  let bucketNames = {};
  if (bucketIds.length) {
    const { data: buckets } = await supabaseClient
      .from('buckets')
      .select('id, name')
      .in('id', bucketIds);
    (buckets || []).forEach(b => { bucketNames[b.id] = b.name; });
  }

  return `
    <div class="card" style="margin:0; box-shadow:none; border:none; padding:0;">
      ${cardRow('From bucket', escapeHtml(bucketNames[transfer.from_bucket_id] || transfer.from_bucket_id || '—'))}
      ${cardRow('To bucket', escapeHtml(bucketNames[transfer.to_bucket_id] || transfer.to_bucket_id || '—'))}
      ${cardRow('Amount', `${fmtPortal(transfer.amount)} ${escapeHtml(transfer.currency || '')}`)}
      ${transfer.amount_usd != null ? cardRow('USD', `$${fmtPortal(transfer.amount_usd)}`) : ''}
      ${cardRow('Status', escapeHtml(transfer.status || '—'))}
      ${transfer.description ? cardRow('Memo', escapeHtml(transfer.description)) : ''}
      ${cardRow('Created', escapeHtml(transfer.created_at ? new Date(transfer.created_at).toLocaleString() : '—'))}
    </div>
  `;
}

async function buildReconReviewBody(requestId, row) {
  const lines = await loadReconciliationRequestLines(requestId);
  const tableRows = (lines || []).map(line => `
    <tr>
      <td data-label="Bucket">${escapeHtml(line.bucket_name)}</td>
      <td data-label="Balance">${fmtPortal(line.closing_balance)} ${escapeHtml(line.currency || '')}</td>
      <td data-label="Actual">${fmtPortal(line.actual_balance)}</td>
      <td data-label="Difference">${fmtPortal(line.difference)}</td>
      <td data-label="Reason">${escapeHtml(line.comments || '—')}</td>
    </tr>
  `).join('');

  const mobileCards = (lines || []).map(line => `
    <article class="data-card data-card--compact">
      <div class="data-card-top"><span class="data-card-title">${escapeHtml(line.bucket_name)}</span></div>
      ${cardRow('Balance', `${fmtPortal(line.closing_balance)} ${escapeHtml(line.currency || '')}`)}
      ${cardRow('Actual', fmtPortal(line.actual_balance))}
      ${cardRow('Difference', fmtPortal(line.difference))}
      ${cardRow('Reason', escapeHtml(line.comments || '—'))}
    </article>
  `).join('');

  return `
    <p class="page-intro" style="margin-bottom:12px;">Team: <strong>${escapeHtml(row.teams?.name || '—')}</strong></p>
    <h4 style="margin:0 0 12px;">Reconciliation lines</h4>
    <div class="table-container show-desktop">
      <table class="table-stack-mobile">
        <thead>
          <tr><th>Bucket</th><th>Balance</th><th>Actual</th><th>Difference</th><th>Reason</th></tr>
        </thead>
        <tbody>${tableRows || '<tr><td colspan="5">No lines</td></tr>'}</tbody>
      </table>
    </div>
    <div class="show-mobile data-card-list">${mobileCards || '<p class="empty-state">No lines</p>'}</div>
  `;
}

async function portalAction(event, action, id) {
  const btn = event?.currentTarget;
  setButtonLoading(btn, true);
  try {
    if (action === 'approve') {
      await approveAndSendRequest(id, '');
      showToast('1 request approved', 'success');
    } else if (action === 'reject') {
      const note = await showPrompt('Optional note for the requester.', {
        title: 'Reject request',
        label: 'Reason',
        placeholder: 'Why is this rejected?',
        multiline: true,
        required: false,
        okLabel: 'Reject'
      });
      if (note === null) return;
      await rejectRequest(id, note || 'Rejected');
      showToast('1 request rejected', 'success');
    } else if (action === 'clarify') {
      const note = await showPrompt('What needs to be clarified?', {
        title: 'Ask for clarification',
        label: 'Message to requester',
        placeholder: 'Describe what you need…',
        multiline: true,
        required: true,
        okLabel: 'Send'
      });
      if (!note) return;
      await clarifyRequest(id, 'REQUESTER', note);
      showToast('Clarification requested', 'success');
    } else if (action === 'reply') {
      const note = await showPrompt('Your reply to the clarification.', {
        title: 'Reply',
        label: 'Message',
        placeholder: 'Type your reply…',
        multiline: true,
        required: true,
        okLabel: 'Send reply'
      });
      if (!note) return;
      await replyClarification(id, note);
      showToast('Reply sent', 'success');
    } else if (action === 'cancel') {
      const ok = await new Promise(resolve => {
        showConfirm('Cancel this request back to Draft?', () => resolve(true), () => resolve(false));
      });
      if (!ok) return;
      await cancelRequest(id, 'Cancelled by requester');
      showToast('Cancelled', 'success');
    }
    portalCloseReviewModal();
    await loadInboxFromServer();
    searchApprovalPortal();
  } catch (err) {
    showToast(err.message || 'Action failed', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

async function portalBatchApprove(event) {
  const ids = [...selectedIds].filter(id => rowCanActMap.get(id));
  if (!ids.length) {
    showToast('Select requests that are your turn', 'warning');
    return;
  }
  const btn = event?.currentTarget;
  setButtonLoading(btn, true);
  try {
    const result = await approveAndSendBatch(ids, '');
    const n = result.sent?.length || 0;
    showToast(n === 1 ? '1 request approved' : `${n} requests approved`, 'success');
    if (result.failed?.length) {
      const f = result.failed.length;
      showToast(f === 1 ? '1 request failed' : `${f} requests failed`, 'warning');
    }
    await loadInboxFromServer();
    searchApprovalPortal();
  } catch (err) {
    showToast(err.message || 'Batch failed', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

function fmtPortal(n) {
  const x = parseFloat(n);
  return Number.isFinite(x) ? x.toFixed(2) : '—';
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}
