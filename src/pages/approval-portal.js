// ==================== APPROVAL PORTAL (Phase 4B) ====================
import { state } from '../state.js';
import { showToast } from '../components/toasts.js';
import { cardRow } from '../utils/uiHelpers.js';
import { approvalStatusBadge } from '../utils/approvalConstants.js';
import { canManageRoleAssignments, clarifyRoleFromStatus, userCanActOnRequest, canCancelRequest } from '../utils/approvalAccess.js';
import {
  fetchApprovalInbox,
  loadRequestMessages,
  loadReconciliationRequestLines,
  approveRequest,
  approveAndSendRequest,
  sendApprovedRequest,
  rejectRequest,
  cancelRequest,
  clarifyRequest,
  replyClarification,
  sendApprovedBatch,
  approveRequestBatch,
  approveAndSendBatch,
  rejectRequestBatch
} from '../utils/approvalEngine.js';

let inboxRows = [];
let selectedIds = new Set();
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
    <p class="page-intro">Triage and act on budget and transfer requests. Defaults to <strong>your</strong> active items.</p>

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
        ${canManageRoleAssignments() ? '<button type="button" class="secondary" onclick="window.showPage(\'role-assignments\')">FIN / Role Assignments</button>' : ''}
      </div>
    </div>

    <div class="card" id="portalBatchBar" style="display:none;">
      <h3>Batch actions (<span id="portalSelectedCount">0</span> selected)</h3>
      <div class="btn-group">
        <button type="button" class="success" onclick="window.portalBatchApprove()">Approve</button>
        <button type="button" class="success" onclick="window.portalBatchApproveSend()">Approve &amp; Send</button>
        <button type="button" onclick="window.portalBatchSend()">Send approved</button>
        <button type="button" class="secondary danger" onclick="window.portalBatchReject()">Reject</button>
        <button type="button" class="secondary" onclick="window.portalClearSelection()">Clear</button>
      </div>
    </div>

    <div id="portalInboxList" class="data-card-list"></div>
    <div id="portalDetail" style="display:none; margin-top:16px;"></div>
  `;
}

export async function initApprovalPortalPage() {
  window.refreshApprovalPortal = refreshApprovalPortal;
  window.portalToggleSelect = portalToggleSelect;
  window.portalOpenDetail = portalOpenDetail;
  window.portalCloseDetail = portalCloseDetail;
  window.portalAction = portalAction;
  window.portalBatchApprove = portalBatchApprove;
  window.portalBatchApproveSend = portalBatchApproveSend;
  window.portalBatchSend = portalBatchSend;
  window.portalBatchReject = portalBatchReject;
  window.portalClearSelection = portalClearSelection;
  window.portalSwitchTeam = portalSwitchTeam;

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

async function refreshApprovalPortal() {
  const listEl = document.getElementById('portalInboxList');
  if (!listEl) return;

  listEl.innerHTML = '<p class="empty-state">Loading…</p>';
  selectedIds = new Set();
  updateBatchBar();

  try {
    inboxRows = await fetchApprovalInbox(getFilters());

    if (!inboxRows.length) {
      listEl.innerHTML = '<p class="empty-state">No requests match these filters.</p>';
      portalCloseDetail();
      return;
    }

    const cards = await Promise.all(inboxRows.map((row, idx) => renderInboxCard(row, idx)));
    listEl.innerHTML = cards.join('');
  } catch (err) {
    console.error('Approval portal:', err);
    listEl.innerHTML = `<p class="empty-state" style="color:#dc3545;">${err.message}</p>`;
  }
}

async function renderInboxCard(row, idx) {
  const badge = approvalStatusBadge(row.status);
  const canAct = await userCanActOnRequest(row);
  const teamName = row.teams?.name || '—';
  const typeLabel = TYPE_LABELS[row.request_type] || row.request_type;
  const amount = row.amount_usd != null ? `$${parseFloat(row.amount_usd).toFixed(2)}` : '—';
  const stepHint = row.current_role_code
    ? `Awaiting ${row.current_role_code}${row.step_approved ? ' (approved, ready to send)' : ''}`
    : '';

  return `
    <article class="data-card data-card--compact">
      <div class="data-card-top">
        <label class="checkbox-label" onclick="event.stopPropagation()">
          <input type="checkbox" data-portal-id="${row.id}" onchange="window.portalToggleSelect('${row.id}', this.checked)">
        </label>
        <span class="data-card-title" style="cursor:pointer;" onclick="window.portalOpenDetail('${row.id}')">${row.request_number}</span>
        <span class="badge ${badge.class}">${badge.label}</span>
      </div>
      ${cardRow('Title', row.title || '—')}
      ${cardRow('Type', typeLabel)}
      ${cardRow('Team', teamName)}
      ${cardRow('Amount', amount)}
      ${stepHint ? cardRow('Step', stepHint) : ''}
      ${row.group_number ? cardRow('Group', row.group_number) : ''}
      <div class="btn-group" style="margin-top:8px;" onclick="event.stopPropagation()">
        <button type="button" class="small secondary" onclick="window.portalOpenDetail('${row.id}')">Open</button>
        ${row.team_id ? `<button type="button" class="small" onclick="window.portalSwitchTeam('${row.team_id}')">Switch team</button>` : ''}
        ${canAct ? `<button type="button" class="small success" onclick="window.portalAction('approve-send','${row.id}')">Approve &amp; Send</button>` : ''}
      </div>
    </article>
  `;
}

function portalToggleSelect(id, checked) {
  if (checked) selectedIds.add(id);
  else selectedIds.delete(id);
  updateBatchBar();
}

function updateBatchBar() {
  const bar = document.getElementById('portalBatchBar');
  const countEl = document.getElementById('portalSelectedCount');
  if (countEl) countEl.textContent = String(selectedIds.size);
  if (bar) bar.style.display = selectedIds.size > 0 ? '' : 'none';
}

function portalClearSelection() {
  selectedIds = new Set();
  document.querySelectorAll('[data-portal-id]').forEach(el => { el.checked = false; });
  updateBatchBar();
}

async function portalOpenDetail(requestId) {
  const row = inboxRows.find(r => r.id === requestId);
  const detailEl = document.getElementById('portalDetail');
  if (!row || !detailEl) return;

  detailRequestId = requestId;
  detailEl.style.display = '';

  try {
    detailMessages = await loadRequestMessages(requestId);
    const canAct = await userCanActOnRequest(row);
    const canCancel = canCancelRequest(row);
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

    detailEl.innerHTML = `
      <div class="card">
        <div class="btn-group" style="margin-bottom:12px;">
          <button type="button" class="secondary" onclick="window.portalCloseDetail()">Close</button>
          ${row.team_id ? `<button type="button" onclick="window.portalSwitchTeam('${row.team_id}')">Open team workspace</button>` : ''}
        </div>
        <div class="data-card-top">
          <h3 style="margin:0;">${row.request_number} — ${row.title || ''}</h3>
          <span class="badge ${badge.class}">${badge.label}</span>
        </div>
        ${cardRow('Team', teamName)}
        ${cardRow('Type', TYPE_LABELS[row.request_type] || row.request_type)}
        ${row.amount_usd != null ? cardRow('Amount', `$${parseFloat(row.amount_usd).toFixed(2)}`) : ''}
        ${row.current_role_code ? cardRow('Current step', row.current_role_code + (row.step_approved ? ' ✓ approved' : '')) : ''}

        ${reconLinesHtml}

        ${canCancel ? `
          <div class="btn-group" style="margin-top:16px;">
            <button type="button" class="secondary" onclick="window.portalAction('cancel','${row.id}')">Cancel request</button>
          </div>
          <p class="page-intro" style="margin-top:8px; font-size:0.9em;">Cancelling returns this request to <strong>Draft</strong> so you can edit and resubmit later.</p>
        ` : ''}

        ${canAct ? `
          <div class="form-group" style="margin-top:16px;">
            <label>Message (optional for approve; required for clarify/reply)</label>
            <textarea id="portalActionMessage" rows="3" placeholder="Add a note…"></textarea>
          </div>
          <div class="btn-group">
            <button type="button" class="success" onclick="window.portalAction('approve','${row.id}')">Approve</button>
            <button type="button" class="success" onclick="window.portalAction('approve-send','${row.id}')">Approve &amp; Send</button>
            ${row.step_approved ? `<button type="button" onclick="window.portalAction('send','${row.id}')">Send</button>` : ''}
            <button type="button" class="secondary danger" onclick="window.portalAction('reject','${row.id}')">Reject</button>
            <button type="button" class="secondary" onclick="window.portalAction('clarify','${row.id}')">Clarify</button>
          </div>
        ` : ''}

        ${clarifyRole ? `
          <div class="form-group" style="margin-top:12px;">
            <label>Reply to clarification (${clarifyRole})</label>
            <textarea id="portalReplyMessage" rows="2"></textarea>
            <button type="button" style="margin-top:8px;" onclick="window.portalAction('reply','${row.id}')">Reply</button>
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

async function portalAction(action, requestId) {
  const msg = document.getElementById('portalActionMessage')?.value
    || document.getElementById('portalReplyMessage')?.value
    || '';

  try {
    if (action === 'approve') {
      await approveRequest(requestId, msg);
      showToast('Approved — ready to send when you are', 'success');
    } else if (action === 'approve-send') {
      await approveAndSendRequest(requestId, msg);
      showToast('Approved and sent forward', 'success');
    } else if (action === 'send') {
      await sendApprovedRequest(requestId, msg);
      showToast('Sent forward', 'success');
    } else if (action === 'cancel') {
      if (!window.confirm('Cancel this approval request and return it to draft?')) return;
      await cancelRequest(requestId, msg || 'Cancelled by requester');
      showToast('Request cancelled — now in draft', 'info');
    } else if (action === 'reject') {
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
  }
}

async function portalBatchApprove() {
  const ids = [...selectedIds];
  const msg = '';
  const result = await approveRequestBatch(ids, msg);
  showBatchResult('Approved', result.approved.length, result.failed);
  await refreshApprovalPortal();
}

async function portalBatchApproveSend() {
  const ids = [...selectedIds];
  const result = await approveAndSendBatch(ids);
  showBatchResult('Sent forward', result.sent.length, result.failed);
  await refreshApprovalPortal();
}

async function portalBatchSend() {
  const ids = [...selectedIds];
  const result = await sendApprovedBatch(ids);
  const n = result.sent.length;
  const f = result.failed.length;
  let text = `Sent ${n} request${n === 1 ? '' : 's'}`;
  if (result.groupNumber) text += ` as group ${result.groupNumber}`;
  if (f) text += ` — ${f} failed`;
  showToast(text, f ? 'warning' : 'success');
  await refreshApprovalPortal();
}

async function portalBatchReject() {
  const msg = window.prompt('Rejection message (optional, shared with all selected):') || '';
  const result = await rejectRequestBatch([...selectedIds], msg);
  showBatchResult('Rejected', result.rejected.length, result.failed);
  await refreshApprovalPortal();
}

function showBatchResult(label, okCount, failures) {
  let text = `${label} ${okCount} item${okCount === 1 ? '' : 's'}`;
  if (failures?.length) {
    text += ` — ${failures.length} failed`;
  }
  showToast(text, failures?.length ? 'warning' : 'success');
}

function portalSwitchTeam(teamId) {
  if (typeof window.switchTeam === 'function') {
    window.switchTeam(teamId);
    showToast('Switched team context', 'info');
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
