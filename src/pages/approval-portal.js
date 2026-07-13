// ==================== APPROVAL PORTAL (Phase 4B) ====================
import { state } from '../state.js';
import { showToast, showConfirm } from '../components/toasts.js';
import { cardRow, setButtonLoading } from '../utils/uiHelpers.js';
import { approvalStatusBadge } from '../utils/approvalConstants.js';
import { clarifyRoleFromStatus, userCanActOnRequest, canCancelRequest } from '../utils/approvalAccess.js';
import {
  fetchApprovalInbox,
  loadRequestMessages,
  loadReconciliationRequestLines,
  approveAndSendRequest,
  rejectRequest,
  cancelRequest,
  clarifyRequest,
  replyClarification,
  approveAndSendBatch
} from '../utils/approvalEngine.js';

let inboxRows = [];
let selectedIds = new Set();
let rowCanActMap = new Map();
let detailRequestId = null;
let detailMessages = [];

const TYPE_LABELS = {
  budget: 'Budget',
  money_transfer: 'Money Transfer',
  reconciliation_adjustment: 'Reconciliation'
};

export function getApprovalPortalPage() {
  return `
    <h1 class="page-title">Approval Portal</h1>
    <p class="page-intro">Triage and act on budget, transfer, and reconciliation requests. <strong>Submitted</strong> means the team sent it into the approval chain — use <strong>Approve</strong> at your step to move it to the next role (OPH → FIN → FIH → CAO).</p>

    <div class="card">
      <h2>Filters</h2>
      <div class="form-grid">
        <div class="form-group">
          <label>Team</label>
          <select id="portalTeamFilter" onchange="window.refreshApprovalPortal()">
            <option value="">All teams</option>
          </select>
        </div>
        <div class="form-group">
          <label>Status</label>
          <select id="portalStatusFilter" onchange="window.refreshApprovalPortal()">
            <option value="active" selected>Active</option>
            <option value="all">All</option>
            <option value="closed">Approved (closed)</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <div class="form-group">
          <label>Type</label>
          <select id="portalTypeFilter" onchange="window.refreshApprovalPortal()">
            <option value="all">All types</option>
            <option value="budget">Budget</option>
            <option value="money_transfer">Money Transfer</option>
            <option value="reconciliation_adjustment">Reconciliation</option>
          </select>
        </div>
        <div class="form-group">
          <label>Search</label>
          <input type="text" id="portalSearch" placeholder="TTM-42 or title" onkeydown="if(event.key==='Enter')window.refreshApprovalPortal()">
        </div>
      </div>
      <div class="form-group" style="margin-top:8px;">
        <label class="checkbox-label">
          <input type="checkbox" id="portalShowAll" onchange="window.refreshApprovalPortal()">
          Show all (not just mine)
        </label>
      </div>
      <div class="btn-group">
        <button type="button" onclick="window.refreshApprovalPortal()">Refresh</button>
      </div>
    </div>

    <div class="card" id="portalBatchBar" style="display:none;">
      <h3>Batch actions (<span id="portalSelectedCount">0</span> selected)</h3>
      <p class="page-intro" style="margin:0 0 8px; font-size:0.9em;">Select requests awaiting <strong>your</strong> role and click <strong>Approve</strong> to sign off and forward to the next step.</p>
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
  window.refreshApprovalPortal = refreshApprovalPortal;
  window.portalToggleSelect = portalToggleSelect;
  window.portalToggleSelectAll = portalToggleSelectAll;
  window.portalOpenDetail = portalOpenDetail;
  window.portalCloseDetail = portalCloseDetail;
  window.portalAction = portalAction;
  window.portalBatchApprove = portalBatchApprove;

  populateTeamFilter();
  await refreshApprovalPortal();
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
    showAll: document.getElementById('portalShowAll')?.checked || false,
    statusFilter: document.getElementById('portalStatusFilter')?.value || 'active',
    typeFilter: document.getElementById('portalTypeFilter')?.value || 'all',
    search: document.getElementById('portalSearch')?.value || '',
    teamId: document.getElementById('portalTeamFilter')?.value || null
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

async function refreshApprovalPortal() {
  const tableBody = document.getElementById('portalInboxTableBody');
  const mobileEl = document.getElementById('portalInboxMobile');
  if (!tableBody && !mobileEl) return;

  if (tableBody) tableBody.innerHTML = '<tr><td colspan="9" class="empty-state">Loading…</td></tr>';
  if (mobileEl) mobileEl.innerHTML = '<p class="empty-state">Loading…</p>';
  selectedIds = new Set();
  rowCanActMap = new Map();
  updateBatchBar();

  try {
    inboxRows = await fetchApprovalInbox(getFilters());

    if (!inboxRows.length) {
      if (tableBody) tableBody.innerHTML = '<tr><td colspan="9" class="empty-state">No requests match these filters.</td></tr>';
      if (mobileEl) mobileEl.innerHTML = '<p class="empty-state">No requests match these filters.</p>';
      portalCloseDetail();
      return;
    }

    await Promise.all(inboxRows.map(async row => {
      rowCanActMap.set(row.id, await userCanActOnRequest(row));
    }));

    const rendered = inboxRows.map(row => renderInboxRow(row));
    if (tableBody) tableBody.innerHTML = rendered.map(r => r.table).join('');
    if (mobileEl) mobileEl.innerHTML = rendered.map(r => r.mobile).join('');

    const selectAll = document.getElementById('portalSelectAll');
    if (selectAll) selectAll.checked = false;
  } catch (err) {
    console.error('Approval portal:', err);
    const msg = escapeHtml(err.message);
    if (tableBody) tableBody.innerHTML = `<tr><td colspan="9" class="empty-state" style="color:#dc3545;">${msg}</td></tr>`;
    if (mobileEl) mobileEl.innerHTML = `<p class="empty-state" style="color:#dc3545;">${msg}</p>`;
  }
}

function renderInboxRow(row) {
  const badge = approvalStatusBadge(row.status);
  const canAct = rowCanActMap.get(row.id);
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
        </label>
        <span class="data-card-title">${row.request_number}</span>
        <span class="badge ${badge.class}">${badge.label}</span>
      </div>
      ${cardRow('Title', row.title || '—')}
      ${cardRow('Type', typeLabel)}
      ${cardRow('Team', row.teams?.name || '—')}
      ${cardRow('Amount', amount)}
      ${stepHint !== '—' ? cardRow('Step', stepHint + (yourTurn ? ' — your turn' : '')) : ''}
      ${isMine ? cardRow('Submitted by', 'You') : ''}
      <div class="btn-group" style="margin-top:8px;" onclick="event.stopPropagation()">
        <button type="button" class="small secondary" onclick="window.portalOpenDetail('${row.id}')">Open</button>
      </div>
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
  document.querySelectorAll('[data-portal-id]').forEach(el => {
    el.checked = checked;
    portalToggleSelect(el.dataset.portalId, checked);
  });
  if (!checked) {
    selectedIds = new Set();
    updateBatchBar();
  }
}

function updateBatchBar() {
  const bar = document.getElementById('portalBatchBar');
  const countEl = document.getElementById('portalSelectedCount');
  const approveBtn = document.getElementById('portalBatchApproveBtn');
  const actionableCount = countActionableSelected();

  if (countEl) countEl.textContent = String(selectedIds.size);
  if (bar) bar.style.display = selectedIds.size > 0 ? '' : 'none';
  if (approveBtn) {
    approveBtn.disabled = actionableCount === 0;
    approveBtn.title = actionableCount === 0
      ? 'Select at least one request awaiting your approval'
      : `Approve ${actionableCount} request${actionableCount === 1 ? '' : 's'}`;
  }
}

async function portalOpenDetail(requestId) {
  const row = inboxRows.find(r => r.id === requestId);
  const detailEl = document.getElementById('portalDetail');
  if (!row || !detailEl) return;

  detailRequestId = requestId;
  detailEl.style.display = '';

  try {
    detailMessages = await loadRequestMessages(requestId);
    const canAct = rowCanActMap.get(row.id) ?? await userCanActOnRequest(row);
    rowCanActMap.set(row.id, canAct);
    const canCancel = canCancelRequest(row);
    const isMine = row.created_by === state.user?.id;
    const clarifyRole = clarifyRoleFromStatus(row.status);
    const badge = approvalStatusBadge(row.status);
    const teamName = row.teams?.name || '—';

    let reconLinesHtml = '';
    if (row.request_type === 'reconciliation_adjustment') {
      const reconLines = await loadReconciliationRequestLines(requestId);
      if (reconLines.length) {
        reconLinesHtml = `
          <h4 style="margin-top:16px;">Buckets to adjust (mismatch only)</h4>
          <div class="table-container show-desktop">
            <table class="table-stack-mobile">
              <thead>
                <tr><th>Bucket</th><th>Balance</th><th>Actual</th><th>Difference</th><th>Reason</th></tr>
              </thead>
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
          <div class="show-mobile data-card-list">
            ${reconLines.map(line => `
              <article class="data-card data-card--compact">
                <div class="data-card-top"><span class="data-card-title">${escapeHtml(line.bucket_name)}</span></div>
                ${cardRow('Balance', `${fmtPortal(line.closing_balance)} ${line.currency || ''}`)}
                ${cardRow('Actual', fmtPortal(line.actual_balance))}
                ${cardRow('Difference', fmtPortal(line.difference))}
                ${cardRow('Reason', line.comments || '—')}
              </article>
            `).join('')}
          </div>
        `;
      }
    }

    const messagesHtml = detailMessages.length
      ? detailMessages.map(m => {
          const author = m.users?.name || m.users?.email || m.author_id?.slice(0, 8) || 'User';
          const when = new Date(m.created_at).toLocaleString();
          return `
            <article class="data-card data-card--compact">
              <div class="data-card-top">
                <span class="data-card-title">${author}</span>
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
      waitingHtml = `<p class="page-intro" style="margin-top:16px; font-size:0.9em;">Waiting for <strong>${row.current_role_code}</strong> — you submitted this request and cannot approve your own.</p>`;
    }

    detailEl.innerHTML = `
      <div class="card">
        <div class="btn-group" style="margin-bottom:12px;">
          <button type="button" class="secondary" onclick="window.portalCloseDetail()">Close</button>
        </div>
        <div class="data-card-top">
          <h3 style="margin:0;">${row.request_number} — ${row.title || ''}</h3>
          <span class="badge ${badge.class}">${badge.label}</span>
        </div>
        ${cardRow('Team', teamName)}
        ${cardRow('Type', TYPE_LABELS[row.request_type] || row.request_type)}
        ${row.amount_usd != null ? cardRow('Amount', `$${parseFloat(row.amount_usd).toFixed(2)}`) : ''}
        ${row.current_role_code ? cardRow('Current step', `Awaiting ${row.current_role_code}`) : ''}
        ${isMine ? cardRow('Submitted by', 'You — use Cancel if you need to withdraw') : ''}

        ${reconLinesHtml}

        ${canCancel ? `
          <div class="btn-group" style="margin-top:16px;">
            <button type="button" class="secondary" data-portal-action="cancel" onclick="window.portalAction(event,'cancel','${row.id}')">Cancel request</button>
          </div>
          <p class="page-intro" style="margin-top:8px; font-size:0.9em;">Cancelling returns this request to <strong>Draft</strong> so you can edit and resubmit later.</p>
        ` : ''}

        ${waitingHtml}

        ${canAct ? `
          <div class="form-group" style="margin-top:16px;">
            <label>Message (optional for approve; required for reject, clarify, and reply)</label>
            <textarea id="portalActionMessage" rows="3" placeholder="Add a note…"></textarea>
          </div>
          <div class="btn-group" id="portalDetailActions">
            ${actionButtons.join('')}
          </div>
        ` : ''}

        ${clarifyRole ? `
          <div class="form-group" style="margin-top:12px;">
            <label>Reply to clarification (${clarifyRole})</label>
            <textarea id="portalReplyMessage" rows="2"></textarea>
            <button type="button" style="margin-top:8px;" data-portal-action="reply" onclick="window.portalAction(event,'reply','${row.id}')">Reply</button>
          </div>
        ` : ''}

        <h4 style="margin-top:20px;">Messages</h4>
        <div class="data-card-list">${messagesHtml}</div>
      </div>
    `;
  } catch (err) {
    detailEl.innerHTML = `<div class="card"><p class="empty-state" style="color:#dc3545;">${err.message}</p></div>`;
  }
}

function portalCloseDetail() {
  detailRequestId = null;
  const detailEl = document.getElementById('portalDetail');
  if (detailEl) {
    detailEl.style.display = 'none';
    detailEl.innerHTML = '';
  }
}

async function portalAction(ev, action, requestId) {
  const btn = ev?.currentTarget || ev?.target;
  const msg = document.getElementById('portalActionMessage')?.value
    || document.getElementById('portalReplyMessage')?.value
    || '';

  const idleLabels = {
    approve: 'Approve',
    reject: 'Reject',
    clarify: 'Clarify',
    reply: 'Reply',
    cancel: 'Cancel request'
  };

  try {
    if (btn?.tagName === 'BUTTON') setButtonLoading(btn, true, idleLabels[action] || 'Submit');

    if (action === 'approve') {
      await approveAndSendRequest(requestId, msg);
      showToast('Approved and sent to the next step', 'success');
    } else if (action === 'cancel') {
      const ok = await showConfirm('Cancel this approval request and return it to draft?');
      if (!ok) return;
      await cancelRequest(requestId, msg || 'Cancelled by requester');
      showToast('Request cancelled — now in draft', 'info');
    } else if (action === 'reject') {
      if (!msg.trim()) {
        showToast('Enter a reject reason in the message box before rejecting.', 'warning');
        return;
      }
      await rejectRequest(requestId, msg);
      showToast('Request rejected — returned to team', 'info');
    } else if (action === 'clarify') {
      const row = inboxRows.find(r => r.id === requestId);
      const role = row?.current_role_code || 'OPL';
      if (!msg.trim()) {
        showToast('Enter a clarification message', 'warning');
        return;
      }
      await clarifyRequest(requestId, role, msg);
      showToast(`Clarification requested from ${role}`, 'info');
    } else if (action === 'reply') {
      if (!msg.trim()) {
        showToast('Enter a reply', 'warning');
        return;
      }
      await replyClarification(requestId, msg);
      showToast('Reply sent', 'success');
    }

    await refreshApprovalPortal();
    if (detailRequestId === requestId) await portalOpenDetail(requestId);
  } catch (err) {
    showToast(err.message || 'Action failed', 'error');
  } finally {
    if (btn?.tagName === 'BUTTON') setButtonLoading(btn, false, idleLabels[action] || 'Submit');
  }
}

async function portalBatchApprove(ev) {
  const btn = ev?.currentTarget || document.getElementById('portalBatchApproveBtn');
  const ids = [...selectedIds].filter(id => rowIsActionable(inboxRows.find(r => r.id === id)));
  if (!ids.length) {
    showToast('Select at least one request awaiting your approval', 'warning');
    return;
  }

  setButtonLoading(btn, true, 'Approve');
  try {
    const result = await approveAndSendBatch(ids);
    const n = result.sent.length;
    const f = result.failed.length;
    let text = `Approved ${n} request${n === 1 ? '' : 's'}`;
    if (f) text += ` — ${f} failed`;
    showToast(text, f ? 'warning' : 'success');
    await refreshApprovalPortal();
  } catch (err) {
    showToast(err.message || 'Batch approve failed', 'error');
  } finally {
    setButtonLoading(btn, false, 'Approve');
  }
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fmtPortal(n) {
  return (parseFloat(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
