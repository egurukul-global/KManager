/* ========== APPROVAL PORTAL ========== */
import { state } from '../state.js';
import { showToast, showConfirm } from '../components/toasts.js';
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
  loadRequestMessages,
  loadReconciliationRequestLines,
  approveAndSendRequest,
  rejectRequest,
  cancelRequest,
  clarifyRequest,
  replyClarification,
  approveAndSendBatch
} from '../utils/approvalEngine.js';

/** Full list loaded once; filters/search work on this cache. */
let inboxCache = [];
let inboxRows = [];
let selectedIds = new Set();
let rowCanActMap = new Map();
let detailRequestId = null;
let detailMessages = [];
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
              <th></th>
            </tr>
          </thead>
          <tbody id="portalInboxTableBody">
            <tr><td colspan="9" class="empty-state">Loading…</td></tr>
          </tbody>
        </table>
      </div>
      <div id="portalInboxMobile" class="show-mobile data-card-list"></div>
    </div>
    <div id="portalDetail" style="display:none; margin-top:16px;"></div>
  `;
}

export async function initApprovalPortalPage() {
  window.searchApprovalPortal = searchApprovalPortal;
  window.refreshApprovalPortal = searchApprovalPortal;
  window.portalToggleSelect = portalToggleSelect;
  window.portalToggleSelectAll = portalToggleSelectAll;
  window.portalOpenDetail = portalOpenDetail;
  window.portalCloseDetail = portalCloseDetail;
  window.portalAction = portalAction;
  window.portalBatchApprove = portalBatchApprove;

  populateTeamFilter();
  await setupStepFilter();
  try {
    await loadInboxFromServer();
    searchApprovalPortal();
  } catch (err) {
    showToast(err.message || 'Failed to load approvals', 'error');
  }
}

async function setupStepFilter() {
  myStepCodes = (await getUserApprovalRoleCodes(state.user?.id, state.currentTeam?.team_id))
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

  // Default to their concrete step (FIN/FIH/CAO…) when known; else My step
  select.value = primary || 'mine';
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
    portalCloseDetail();
    return;
  }

  const rendered = inboxRows.map(row => renderInboxRow(row));
  if (tableBody) tableBody.innerHTML = rendered.map(r => r.table).join('');
  if (mobileEl) mobileEl.innerHTML = rendered.map(r => r.mobile).join('');

  const selectAll = document.getElementById('portalSelectAll');
  if (selectAll) selectAll.checked = false;
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
      <td data-label="Actions" onclick="event.stopPropagation()">
        <button type="button" class="small secondary" onclick="window.portalOpenDetail('${row.id}')">Open</button>
      </td>
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

async function portalOpenDetail(id) {
  detailRequestId = id;
  const row = inboxCache.find(r => r.id === id) || inboxRows.find(r => r.id === id);
  const detail = document.getElementById('portalDetail');
  if (!detail || !row) return;

  detail.style.display = '';
  detail.innerHTML = '<div class="card"><p class="empty-state">Loading…</p></div>';

  try {
    detailMessages = await loadRequestMessages(id);
  } catch (err) {
    detailMessages = [];
    console.warn(err);
  }

  let reconHtml = '';
  if (row.request_type === 'reconciliation_adjustment') {
    try {
      const reconLines = await loadReconciliationRequestLines(id);
      if (reconLines?.length) {
        reconHtml = `
          <h3 style="margin-top:16px;">Reconciliation lines</h3>
          <div class="table-container show-desktop">
            <table class="table-stack-mobile">
              <thead><tr><th>Bucket</th><th>Balance</th><th>Actual</th><th>Difference</th><th>Reason</th></tr></thead>
              <tbody>
                ${reconLines.map(line => `
                  <tr>
                    <td data-label="Bucket">${escapeHtml(line.bucket_name)}</td>
                    <td data-label="Balance">${fmtPortal(line.closing_balance)} ${line.currency || ''}</td>
                    <td data-label="Actual">${fmtPortal(line.actual_balance)}</td>
                    <td data-label="Difference">${fmtPortal(line.difference)}</td>
                    <td data-label="Reason">${escapeHtml(line.comments || '—')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      }
    } catch (err) {
      console.warn(err);
    }
  }

  const canAct = await userCanActOnRequest(row);
  const isMine = row.created_by === state.user?.id;
  const canCancel = canCancelRequest(row);
  const badge = approvalStatusBadge(row.status);
  const clarifyRole = clarifyRoleFromStatus(row.status);

  const messagesHtml = detailMessages.length
    ? detailMessages.map(m => {
        const author = m.users?.name || m.users?.email || m.author_id?.slice(0, 8) || 'User';
        const when = new Date(m.created_at).toLocaleString();
        return `
          <article class="data-card data-card--compact">
            <div class="data-card-top">
              <span class="data-card-title">${escapeHtml(author)}</span>
              <span class="data-card-meta">${when}</span>
            </div>
            <p style="margin:0; white-space:pre-wrap;">${escapeHtml(m.body)}</p>
          </article>
        `;
      }).join('')
    : '<p class="empty-state">No messages yet.</p>';

  const actionButtons = [];
  let waitingHtml = '';
  if (canAct) {
    actionButtons.push(`<button type="button" class="success" data-portal-action="approve" onclick="window.portalAction(event,'approve','${row.id}')">Approve</button>`);
    actionButtons.push(`<button type="button" class="secondary danger" data-portal-action="reject" onclick="window.portalAction(event,'reject','${row.id}')">Reject</button>`);
    actionButtons.push(`<button type="button" class="secondary" data-portal-action="clarify" onclick="window.portalAction(event,'clarify','${row.id}')">Clarify</button>`);
  } else if (isMine && row.current_role_code) {
    waitingHtml = `<p class="page-intro" style="margin-top:16px; font-size:0.9em;">Waiting for <strong>${row.current_role_code}</strong> — you submitted this and cannot approve your own.</p>`;
  }

  if (clarifyRole && (canAct || isMine)) {
    actionButtons.push(`<button type="button" class="secondary" data-portal-action="reply" onclick="window.portalAction(event,'reply','${row.id}')">Reply to clarify</button>`);
  }
  if (canCancel) {
    actionButtons.push(`<button type="button" class="secondary danger" data-portal-action="cancel" onclick="window.portalAction(event,'cancel','${row.id}')">Cancel request</button>`);
  }

  detail.innerHTML = `
    <div class="card">
      <div class="data-card-top">
        <h2 style="margin:0;">${escapeHtml(row.request_number)} — ${escapeHtml(row.title || '')}</h2>
        <button type="button" class="small secondary" onclick="window.portalCloseDetail()">Close</button>
      </div>
      ${cardRow('Status', `<span class="badge ${badge.class}">${badge.label}</span>`)}
      ${cardRow('Type', TYPE_LABELS[row.request_type] || row.request_type)}
      ${cardRow('Team', escapeHtml(row.teams?.name || '—'))}
      ${row.current_role_code ? cardRow('Current step', `Awaiting ${row.current_role_code}`) : ''}
      ${row.amount_usd != null ? cardRow('Amount', `$${parseFloat(row.amount_usd).toFixed(2)}`) : ''}
      ${waitingHtml}
      ${reconHtml}
      <h3 style="margin-top:16px;">Messages</h3>
      <div class="data-card-list">${messagesHtml}</div>
      ${actionButtons.length ? `<div class="btn-group" style="margin-top:16px;">${actionButtons.join('')}</div>` : ''}
      <div class="form-group" style="margin-top:12px;">
        <label>Note (optional)</label>
        <textarea id="portalActionNote" rows="2" placeholder="Message for the next step"></textarea>
      </div>
    </div>
  `;
  detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function portalCloseDetail() {
  detailRequestId = null;
  const detail = document.getElementById('portalDetail');
  if (detail) {
    detail.style.display = 'none';
    detail.innerHTML = '';
  }
}

async function portalAction(event, action, id) {
  const btn = event?.currentTarget;
  const note = document.getElementById('portalActionNote')?.value || '';
  setButtonLoading(btn, true);
  try {
    if (action === 'approve') {
      await approveAndSendRequest(id, note);
      showToast('Approved and sent forward', 'success');
    } else if (action === 'reject') {
      await rejectRequest(id, note || 'Rejected');
      showToast('Rejected', 'success');
    } else if (action === 'clarify') {
      const row = inboxCache.find(r => r.id === id);
      const role = row?.current_role_code || 'OPL';
      if (!note.trim()) {
        showToast('Enter a clarification message', 'warning');
        return;
      }
      await clarifyRequest(id, role, note);
      showToast('Clarification requested', 'success');
    } else if (action === 'reply') {
      if (!note.trim()) {
        showToast('Enter a reply', 'warning');
        return;
      }
      await replyClarification(id, note);
      showToast('Reply sent', 'success');
    } else if (action === 'cancel') {
      const ok = await new Promise(resolve => {
        showConfirm('Cancel this request back to Draft?', () => resolve(true), () => resolve(false));
      });
      if (!ok) return;
      await cancelRequest(id, note || 'Cancelled by requester');
      showToast('Cancelled', 'success');
    }
    await loadInboxFromServer();
    searchApprovalPortal();
    portalCloseDetail();
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
    showToast(`Approved ${result.sent?.length || 0}`, 'success');
    if (result.failed?.length) showToast(`${result.failed.length} failed`, 'warning');
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
