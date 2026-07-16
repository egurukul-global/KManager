/* ========== APPROVAL PORTAL ========== */
import { state } from '../state.js';
import { supabaseClient } from '../db.js';
import { showToast, showConfirm, showPrompt } from '../components/toasts.js';
import { cardRow, setButtonLoading } from '../utils/uiHelpers.js';
import { approvalStatusBadge } from '../utils/approvalConstants.js';
import { uploadReceipt, resolveReceiptViewUrl } from '../utils/upload.js';
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
import { budgetStatusBadgeHtml } from '../utils/budgetStatus.js';
import { getBudgetTypeLabel } from '../utils/budgetTypes.js';

/** Full list loaded once; filters/search work on this cache. */
let inboxCache = [];
let inboxRows = [];
let selectedIds = new Set();
let rowCanActMap = new Map();
let rowCommentCountMap = new Map();
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

    <div id="approvalActionModal" class="modal">
      <div class="modal-content" style="max-width: 580px; padding: 18px;">
        <div class="modal-header-row" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 10px; margin-bottom: 14px;">
          <h2 id="approvalActionModalTitle">Approve Request</h2>
          <div class="modal-header-actions" style="display: flex; gap: 8px;">
            <button type="button" class="secondary" onclick="window.closeApprovalActionModal()">Cancel</button>
            <button type="button" class="success" id="approvalActionConfirmBtn" onclick="window.submitApprovalAction()">Confirm</button>
          </div>
        </div>
        
        <form id="approvalActionForm" onsubmit="event.preventDefault();">
          <input type="hidden" id="approvalActionRequestId">
          <input type="hidden" id="approvalActionType">
          <div class="form-stack" style="display: flex; flex-direction: column; gap: 12px;">
            <div class="form-group">
              <textarea id="approvalActionComment" rows="2" placeholder="Write comment / message (optional)..."></textarea>
            </div>

            <div class="form-group" style="display: flex; flex-direction: column; gap: 6px;">
              <label style="font-weight: 600; font-size: 0.85rem; color: var(--text-secondary);">Message Visibility</label>
              <div class="visibility-checkbox-row" style="display: flex; flex-wrap: wrap; gap: 12px; padding: 8px 10px; background: #f9fafb; border: 1px solid var(--border); border-radius: 4px;">
                <label style="font-weight: normal; font-size: 0.85rem; display: flex; align-items: center; gap: 4px; cursor: pointer;"><input type="checkbox" class="vis-role" value="OPL" checked> OPL</label>
                <label style="font-weight: normal; font-size: 0.85rem; display: flex; align-items: center; gap: 4px; cursor: pointer;"><input type="checkbox" class="vis-role" value="OPH" checked> OPH</label>
                <label style="font-weight: normal; font-size: 0.85rem; display: flex; align-items: center; gap: 4px; cursor: pointer;"><input type="checkbox" class="vis-role" value="FIN" checked> FIN</label>
                <label style="font-weight: normal; font-size: 0.85rem; display: flex; align-items: center; gap: 4px; cursor: pointer;"><input type="checkbox" class="vis-role" value="FIP" checked> FIP</label>
                <label style="font-weight: normal; font-size: 0.85rem; display: flex; align-items: center; gap: 4px; cursor: pointer;"><input type="checkbox" class="vis-role" value="FIH" checked> FIH</label>
                <label style="font-weight: normal; font-size: 0.85rem; display: flex; align-items: center; gap: 4px; cursor: pointer;"><input type="checkbox" class="vis-role" value="CAO" checked> CAO</label>
                <label style="font-weight: normal; font-size: 0.85rem; display: flex; align-items: center; gap: 4px; cursor: pointer;"><input type="checkbox" id="approvalActionSelectAll" checked> ALL</label>
              </div>
              <div class="note-text" style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px;">
                * Higher steps (FIH, CAO) always view messages shared with lower steps.
              </div>
            </div>

            <div class="form-group" style="display: flex; flex-direction: column; gap: 6px;">
              <label style="font-weight: 600; font-size: 0.85rem; color: var(--text-secondary);">Attachments (Optional)</label>
              <div class="attachment-upload-zone" onclick="document.getElementById('approvalActionAttachmentFile').click()" style="border: 1px dashed var(--border); border-radius: 4px; padding: 14px; text-align: center; cursor: pointer; color: var(--text-secondary); background: #fafafa; font-size: 0.85rem;">
                <span id="approvalActionAttachmentLabel">📎 Click to upload receipt or screen print</span>
                <input type="file" id="approvalActionAttachmentFile" onchange="window.onApprovalAttachmentChange(this)" style="display: none;" accept="image/*,application/pdf">
              </div>
              <input type="url" id="approvalActionAttachmentUrl" placeholder="Or paste reference URL (https://...)">
            </div>
          </div>
        </form>
    </div>

    <div id="approvalCommentsModal" class="modal">
      <div class="modal-content" style="max-width: 600px;">
        <button type="button" class="close-modal" onclick="window.closeCommentsTimeline()">&times;</button>
        <h2>Discussions & Files</h2>
        <div id="approvalCommentsTimeline" style="max-height: 400px; overflow-y: auto; margin: 16px 0; display: flex; flex-direction: column; gap: 12px; padding-right: 6px;">
        </div>
        <div class="btn-group">
          <button type="button" class="secondary" onclick="window.closeCommentsTimeline()">Close</button>
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
  window.portalRunAction = portalRunAction;
  window.closeApprovalActionModal = closeApprovalActionModal;
  window.onApprovalAttachmentChange = onApprovalAttachmentChange;
  window.submitApprovalAction = submitApprovalAction;
  window.openCommentsTimeline = openCommentsTimeline;
  window.closeCommentsTimeline = closeCommentsTimeline;

  // Bind Select All checkbox logic
  const selectAll = document.getElementById('approvalActionSelectAll');
  if (selectAll) {
    selectAll.checked = true;
    selectAll.addEventListener('change', () => {
      document.querySelectorAll('#approvalActionModal .vis-role').forEach(cb => {
        cb.checked = selectAll.checked;
      });
    });
  }
  document.querySelectorAll('#approvalActionModal .vis-role').forEach(cb => {
    cb.checked = true;
    cb.addEventListener('change', () => {
      const selectAll = document.getElementById('approvalActionSelectAll');
      if (selectAll) {
        if (!cb.checked) {
          selectAll.checked = false;
        } else {
          const allChecked = Array.from(document.querySelectorAll('#approvalActionModal .vis-role')).every(r => r.checked);
          if (allChecked) selectAll.checked = true;
        }
      }
    });
  });

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
  rowCommentCountMap = new Map();
  await Promise.all(inboxCache.map(async row => {
    rowCanActMap.set(row.id, await userCanActOnRequest(row));
  }));

  try {
    const requestIds = inboxCache.map(r => r.id);
    if (requestIds.length) {
      const { data: commentCounts, error: commentError } = await supabaseClient
        .from('approval_comments')
        .select('request_id');
      if (!commentError && commentCounts) {
        const counts = {};
        commentCounts.forEach(c => {
          counts[c.request_id] = (counts[c.request_id] || 0) + 1;
        });
        Object.entries(counts).forEach(([reqId, count]) => {
          rowCommentCountMap.set(reqId, count);
        });
      }
    }
  } catch (err) {
    console.warn('Failed to load comment counts:', err);
  }
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

function rowActionDropdown(row) {
  const canAct = rowIsActionable(row);
  const isMine = row.created_by === state.user?.id;
  const clarifyRole = clarifyRoleFromStatus(row.status);
  const canCancel = canCancelRequest(row);

  return `
    <div class="approval-action-select-wrapper" style="display:flex; align-items:center; gap:5px;">
      <select class="approval-action-select" style="padding:4px 6px; font-size:13px; height:28px; border:1px solid var(--border); border-radius:4px; max-width:130px; background:var(--card-bg); color:var(--text);">
        <option value="">Action</option>
        <option value="open">Open</option>
        ${canAct ? '<option value="approve">Approve</option>' : ''}
        ${canAct ? '<option value="reject">Reject</option>' : ''}
        ${canAct ? '<option value="clarify">Clarify</option>' : ''}
        ${clarifyRole && (canAct || isMine) ? '<option value="reply">Reply</option>' : ''}
        ${canCancel ? '<option value="cancel">Cancel</option>' : ''}
      </select>
      <button type="button" class="small secondary" onclick="event.stopPropagation(); window.portalRunAction(this, '${row.id}')" style="height:28px; padding:0 8px; line-height:1; display:inline-flex; align-items:center; justify-content:center;">OK</button>
    </div>
  `;
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
  const actionsTable = rowActionDropdown(row);
  const actionsMobile = rowActionButtons(row);

  const commentCount = rowCommentCountMap.get(row.id) || 0;
  const commentIcon = commentCount > 0
    ? ` <span class="comment-clip-badge" onclick="event.stopPropagation(); window.openCommentsTimeline('${row.id}')" style="cursor:pointer; display:inline-flex; align-items:center; gap:2px; font-size:0.8em; background:#f3f4f6; padding:2px 6px; border-radius:10px; color:#4b5563; font-weight:normal;" title="Click to view discussions">📎 ${commentCount}</span>`
    : ` <span class="comment-clip-badge" onclick="event.stopPropagation(); window.openCommentsTimeline('${row.id}')" style="cursor:pointer; display:inline-flex; align-items:center; gap:2px; font-size:0.8em; color:#9ca3af; font-weight:normal;" title="Click to view discussions">📎</span>`;

  const table = `
    <tr class="row-clickable" onclick="window.portalOpenDetail('${row.id}')">
      <td data-label="Select" onclick="event.stopPropagation()">
        <input type="checkbox" data-portal-id="${row.id}" onchange="window.portalToggleSelect('${row.id}', this.checked)">
      </td>
      <td data-label="Request"><strong>${row.request_number}</strong>${mineBadge}</td>
      <td data-label="Title">${escapeHtml(row.title || '—')}${commentIcon}</td>
      <td data-label="Type">${typeLabel}</td>
      <td data-label="Team">${teamName}</td>
      <td data-label="Amount">${amount}</td>
      <td data-label="Status"><span class="badge ${badge.class}">${badge.label}</span></td>
      <td data-label="Step">${escapeHtml(stepHint)}${yourTurn ? ' <span class="badge badge-success">Your turn</span>' : ''}</td>
      <td data-label="Actions" class="action-buttons" onclick="event.stopPropagation()">${actionsTable}</td>
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
      ${cardRow('Title', `${escapeHtml(row.title || '—')}${commentIcon}`)}
      ${cardRow('Type', typeLabel)}
      ${cardRow('Team', teamName)}
      ${cardRow('Amount', amount)}
      ${cardRow('Step', `${escapeHtml(stepHint)}${yourTurn ? ' (Your turn)' : ''}`)}
      <div class="action-icon-group" style="margin-top:8px;" onclick="event.stopPropagation()">${actionsMobile}</div>
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

  bodyEl.innerHTML = '<p class="empty-state">Loading…</p>';
  modal.classList.add('active');

  try {
    if (row.request_type === 'budget' && row.budget_plan_id) {
      let budget = (state.budgetPlans || []).find(b => b.id === row.budget_plan_id);
      if (budget) budget = normalizeBudgetPlan(budget);
      if (!budget) {
        const { data: rpcData, error: rpcErr } = await supabaseClient
          .rpc('get_budget_plan_for_review', { p_budget_plan_id: row.budget_plan_id });
        if (!rpcErr && rpcData?.length) {
          budget = normalizeBudgetPlan(rpcData[0]);
        } else {
          const { data, error } = await supabaseClient
            .from('budget_plans')
            .select('*')
            .eq('id', row.budget_plan_id)
            .maybeSingle();
          if (error) throw error;
          if (data) budget = normalizeBudgetPlan(data);
        }
      }

      if (budget) {
        if (titleEl) {
          const statusBadge = budgetStatusBadgeHtml(budget);
          const typeLabel = getBudgetTypeLabel(budget.budget_type);
          titleEl.innerHTML = `${row.request_number} — ${escapeHtml(row.title || 'Review')} ${statusBadge} <span class="badge badge-secondary">${typeLabel}</span>`;
        }
        bodyEl.innerHTML = renderBudgetReviewHtml(budget, { showActions: false, isApprovalMode: true });
      } else {
        throw new Error('Budget plan not found');
      }
    } else if (row.request_type === 'money_transfer' && row.transfer_id) {
      if (titleEl) titleEl.textContent = `${row.request_number} — ${row.title || 'Review'}`;
      bodyEl.innerHTML = await buildTransferReviewBody(row.transfer_id);
    } else if (row.request_type === 'reconciliation_adjustment') {
      if (titleEl) titleEl.textContent = `${row.request_number} — ${row.title || 'Review'}`;
      bodyEl.innerHTML = await buildReconReviewBody(row.id, row);
    } else {
      if (titleEl) titleEl.textContent = `${row.request_number} — ${row.title || 'Review'}`;
      bodyEl.innerHTML = `<p class="empty-state">No linked record to display for this request.</p>
        ${cardRow('Type', TYPE_LABELS[row.request_type] || row.request_type)}
        ${cardRow('Team', escapeHtml(row.teams?.name || '—'))}
        ${row.amount_usd != null ? cardRow('Amount', `$${parseFloat(row.amount_usd).toFixed(2)}`) : ''}`;
    }
  } catch (err) {
    console.error(err);
    if (titleEl) titleEl.textContent = `${row.request_number} — ${row.title || 'Review'}`;
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
  if (action === 'approve' || action === 'reject' || action === 'clarify' || action === 'reply') {
    openApprovalActionModal(id, action);
    return;
  }
  if (action === 'cancel') {
    const ok = await new Promise(resolve => {
      showConfirm('Cancel this request back to Draft?', () => resolve(true), () => resolve(false));
    });
    if (!ok) return;
    setButtonLoading(btn, true);
    try {
      const { cancelRequest } = await import('../utils/approvalEngine.js');
      await cancelRequest(id, 'Cancelled by requester');
      showToast('Cancelled', 'success');
      portalCloseReviewModal();
      await loadInboxFromServer();
      searchApprovalPortal();
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Action failed', 'error');
    } finally {
      setButtonLoading(btn, false);
    }
  }
}

function openApprovalActionModal(requestId, actionType) {
  const modal = document.getElementById('approvalActionModal');
  if (!modal) return;

  if (modal.parentElement !== document.body) {
    document.body.appendChild(modal);
  }

  document.getElementById('approvalActionRequestId').value = requestId;
  document.getElementById('approvalActionType').value = actionType;
  document.getElementById('approvalActionComment').value = '';
  document.getElementById('approvalActionAttachmentUrl').value = '';
  document.getElementById('approvalActionAttachmentFile').value = '';
  document.getElementById('approvalActionAttachmentLabel').textContent = '📎 Click to upload receipt or screen print';
  
  document.querySelectorAll('#approvalActionModal .vis-role').forEach(cb => cb.checked = true);
  const selectAll = document.getElementById('approvalActionSelectAll');
  if (selectAll) selectAll.checked = true;

  const titleEl = document.getElementById('approvalActionModalTitle');
  const confirmBtn = document.getElementById('approvalActionConfirmBtn');
  if (titleEl && confirmBtn) {
    if (actionType === 'approve') {
      titleEl.textContent = 'Approve Request';
      confirmBtn.textContent = 'Approve';
      confirmBtn.className = 'success';
    } else if (actionType === 'reject') {
      titleEl.textContent = 'Reject Request';
      confirmBtn.textContent = 'Reject';
      confirmBtn.className = 'danger';
    } else if (actionType === 'clarify') {
      titleEl.textContent = 'Ask Clarification';
      confirmBtn.textContent = 'Ask';
      confirmBtn.className = 'warning';
    } else if (actionType === 'reply') {
      titleEl.textContent = 'Reply Clarification';
      confirmBtn.textContent = 'Reply';
      confirmBtn.className = 'success';
    }
  }

  modal.classList.add('active');
  modal.style.display = 'flex';
}

function closeApprovalActionModal() {
  const modal = document.getElementById('approvalActionModal');
  modal?.classList.remove('active');
  if (modal) modal.style.display = 'none';
}

function onApprovalAttachmentChange(input) {
  const label = document.getElementById('approvalActionAttachmentLabel');
  if (label) {
    if (input.files && input.files[0]) {
      label.textContent = `📎 Selected: ${input.files[0].name}`;
    } else {
      label.textContent = '📎 Click to upload receipt or screen print';
    }
  }
}

async function submitApprovalAction() {
  const confirmBtn = document.getElementById('approvalActionConfirmBtn');
  const id = document.getElementById('approvalActionRequestId').value;
  const action = document.getElementById('approvalActionType').value;
  const comment = document.getElementById('approvalActionComment').value.trim();
  const attachmentUrl = document.getElementById('approvalActionAttachmentUrl').value.trim();
  const fileInput = document.getElementById('approvalActionAttachmentFile');
  
  const visibleTo = [];
  document.querySelectorAll('#approvalActionModal .vis-role').forEach(cb => {
    if (cb.checked) visibleTo.push(cb.value);
  });
  if (document.getElementById('approvalActionSelectAll')?.checked) {
    visibleTo.push('ALL');
  }

  setButtonLoading(confirmBtn, true);
  try {
    let finalAttachmentUrl = attachmentUrl;
    let finalAttachmentName = '';
    
    if (fileInput.files && fileInput.files[0]) {
      const file = fileInput.files[0];
      finalAttachmentName = file.name;
      const { objectKey } = await uploadReceipt(file);
      finalAttachmentUrl = objectKey;
    }

    if (comment || finalAttachmentUrl) {
      const { error: commentErr } = await supabaseClient
        .from('approval_comments')
        .insert({
          request_id: id,
          user_id: state.user.id,
          comment: comment || null,
          visible_to: visibleTo,
          attachment_url: finalAttachmentUrl || null,
          attachment_name: finalAttachmentName || null
        });
      if (commentErr) throw commentErr;
    }

    const { approveAndSendRequest, rejectRequest, clarifyRequest, replyClarification } = await import('../utils/approvalEngine.js');
    if (action === 'approve') {
      await approveAndSendRequest(id, comment);
      showToast('1 request approved', 'success');
    } else if (action === 'reject') {
      await rejectRequest(id, comment || 'Rejected');
      showToast('1 request rejected', 'success');
    } else if (action === 'clarify') {
      await clarifyRequest(id, 'REQUESTER', comment);
      showToast('Clarification requested', 'success');
    } else if (action === 'reply') {
      await replyClarification(id, comment);
      showToast('Reply sent', 'success');
    }
    
    closeApprovalActionModal();
    portalCloseReviewModal();
    await loadInboxFromServer();
    searchApprovalPortal();
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Action failed', 'error');
  } finally {
    setButtonLoading(confirmBtn, false);
  }
}

async function portalRunAction(btn, rowId) {
  const container = btn.closest('.approval-action-select-wrapper');
  const select = container?.querySelector('.approval-action-select');
  const action = select?.value;
  if (!action) {
    showToast('Select an action first', 'warning');
    return;
  }
  if (action === 'open') {
    window.portalOpenDetail(rowId);
  } else {
    const fakeEvent = { currentTarget: btn };
    await portalAction(fakeEvent, action, rowId);
  }
  if (select) select.value = '';
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

async function openCommentsTimeline(requestId) {
  const modal = document.getElementById('approvalCommentsModal');
  if (modal && modal.parentElement !== document.body) {
    document.body.appendChild(modal);
  }
  const timeline = document.getElementById('approvalCommentsTimeline');
  if (!modal || !timeline) return;

  timeline.innerHTML = '<p class="empty-state">Loading comments…</p>';
  modal.classList.add('active');
  modal.style.display = 'flex';

  try {
    const { data: comments, error } = await supabaseClient
      .from('approval_comments')
      .select('*')
      .eq('request_id', requestId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    if (!comments || !comments.length) {
      timeline.innerHTML = '<p class="empty-state">No comments or files shared with your role.</p>';
      return;
    }

    const userIds = [...new Set(comments.map(c => c.user_id))];
    const usersMap = {};
    if (userIds.length) {
      const { data: usersData, error: userError } = await supabaseClient
        .from('users')
        .select('id, name, email, role')
        .in('id', userIds);
      if (!userError && usersData) {
        usersData.forEach(u => {
          usersMap[u.id] = u;
        });
      }
    }

    const commentsWithUrls = await Promise.all(comments.map(async c => {
      let resolvedUrl = c.attachment_url || '';
      if (c.attachment_url) {
        try {
          resolvedUrl = await resolveReceiptViewUrl(c.attachment_url);
        } catch (e) {
          console.warn('Failed to resolve attachment URL:', e);
        }
      }
      return { ...c, resolvedUrl };
    }));

    timeline.innerHTML = commentsWithUrls.map(c => {
      const u = usersMap[c.user_id] || {};
      const date = new Date(c.created_at).toLocaleString();
      const senderName = u.name || u.email || 'System';
      const senderRole = u.role ? ` (${u.role.toUpperCase()})` : '';
      
      let attachmentHtml = '';
      if (c.attachment_url) {
        const name = c.attachment_name || 'View Attachment';
        attachmentHtml = `
          <div style="margin-top: 8px; font-size: 0.9em;">
            📎 <a href="${c.resolvedUrl}" target="_blank" style="color: var(--primary); text-decoration: underline;">${escapeHtml(name)}</a>
          </div>`;
      }

      return `
        <div style="background: #f9fafb; border: 1px solid var(--border); border-radius: 6px; padding: 12px; position: relative;">
          <div style="display: flex; justify-content: space-between; font-size: 0.8em; color: var(--text-secondary); margin-bottom: 6px;">
            <strong>${escapeHtml(senderName)}${escapeHtml(senderRole)}</strong>
            <span>${date}</span>
          </div>
          <div style="font-size: 0.95em; white-space: pre-wrap; word-break: break-word;">${escapeHtml(c.comment || 'Attachment shared')}</div>
          ${attachmentHtml}
        </div>
      `;
    }).join('');

  } catch (err) {
    console.error('Failed to load comments:', err);
    timeline.innerHTML = `<p class="empty-state" style="color: var(--danger);">Failed to load comments: ${escapeHtml(err.message)}</p>`;
  }
}

function closeCommentsTimeline() {
  const modal = document.getElementById('approvalCommentsModal');
  modal?.classList.remove('active');
  if (modal) modal.style.display = 'none';
}
