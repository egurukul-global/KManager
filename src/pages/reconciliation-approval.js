// ==================== RECONCILIATION APPROVAL (mismatch → balance adjust) ====================
import { state } from '../state.js';
import { supabaseClient } from '../db.js';
import { showToast } from '../components/toasts.js';
import { cardRow } from '../utils/uiHelpers.js';
import { formatDisplayDate, todayDateStr } from '../utils/budgetCalendar.js';
import { formatDifference } from '../utils/financialStatusHelpers.js';
import { submitReconciliationAdjustment } from '../utils/approvalEngine.js';

let mismatchRows = [];
let selectedLineIds = new Set();

function fmtAmount(n) {
  return (parseFloat(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function statusLabel(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'pending') return { text: 'Pending approval', class: 'badge-warning' };
  if (s === 'approved') return { text: 'Approved', class: 'badge-success' };
  if (s === 'rejected') return { text: 'Rejected', class: 'badge-danger' };
  return { text: 'Open', class: 'badge-info' };
}

function canRequestApproval() {
  return !!state.canSubmitReconciliation;
}

export function getReconciliationApprovalPage() {
  const teamName = state.currentTeam?.team_name || 'your team';

  return `
    <h1 class="page-title">Approval</h1>
    <p class="page-intro">
      Optional step after reconcile: request approval to post the <strong>mismatch only</strong> to the bucket
      (current balance + difference recorded at reconcile time — not the absolute actual count, so later income/expenses stay correct).
      Skip if you are still investigating a shortfall.
      Route: <strong>OPH → FIN → FIH → CAO</strong>.
    </p>
    <p class="page-intro">Showing mismatches for <strong>${teamName}</strong>.</p>

    <div class="card">
      <h2>Filters</h2>
      <div class="form-grid">
        <div class="form-group">
          <label>Date From</label>
          <input type="date" id="reconApprovalFrom" onchange="window.loadReconciliationApproval()">
        </div>
        <div class="form-group">
          <label>Date To</label>
          <input type="date" id="reconApprovalTo" onchange="window.loadReconciliationApproval()">
        </div>
        <div class="form-group">
          <label>Adjustment status</label>
          <select id="reconApprovalStatus" onchange="window.loadReconciliationApproval()">
            <option value="available">Available to request</option>
            <option value="pending">Pending approval</option>
            <option value="approved">Approved (adjusted)</option>
            <option value="rejected">Rejected</option>
            <option value="all">All mismatches</option>
          </select>
        </div>
      </div>
      <div class="btn-group">
        <button type="button" onclick="window.loadReconciliationApproval()">Refresh</button>
        ${canRequestApproval() ? `
          <button type="button" class="success" onclick="window.requestReconciliationApproval()">Request approval for selected</button>
        ` : ''}
        <button type="button" class="secondary" onclick="window.showPage('approval-portal')">Open approval portal</button>
      </div>
    </div>

    <div class="card">
      <h2>Mismatched buckets</h2>
      <div class="table-container show-desktop">
        <table class="table-stack-mobile" id="reconApprovalTable">
          <thead>
            <tr>
              ${canRequestApproval() ? '<th><input type="checkbox" id="reconApprovalSelectAll" onchange="window.toggleReconApprovalSelectAll(this.checked)" title="Select all available"></th>' : ''}
              <th>Date</th>
              <th>Bucket</th>
              <th>Balance</th>
              <th>Actual</th>
              <th>Difference</th>
              <th>Reason</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody id="reconApprovalTableBody">
            <tr><td colspan="${canRequestApproval() ? 8 : 7}" class="empty-state">Loading…</td></tr>
          </tbody>
        </table>
      </div>
      <div id="reconApprovalMobile" class="show-mobile data-card-list"></div>
    </div>
  `;
}

export async function initReconciliationApprovalPage() {
  window.loadReconciliationApproval = loadReconciliationApproval;
  window.toggleReconApprovalSelect = toggleReconApprovalSelect;
  window.toggleReconApprovalSelectAll = toggleReconApprovalSelectAll;
  window.requestReconciliationApproval = requestReconciliationApproval;

  selectedLineIds = new Set();
  await loadReconciliationApproval();
}

function resolveDateRange() {
  const today = todayDateStr();
  let fromDate = document.getElementById('reconApprovalFrom')?.value || today;
  let toDate = document.getElementById('reconApprovalTo')?.value || today;
  if (fromDate > toDate) [fromDate, toDate] = [toDate, fromDate];
  return { fromDate, toDate };
}

function rowMatchesStatusFilter(adjustmentStatus, filter) {
  const status = String(adjustmentStatus || '').toLowerCase();
  if (filter === 'all') return true;
  if (filter === 'available') return !status || status === 'rejected';
  if (filter === 'pending') return status === 'pending';
  if (filter === 'approved') return status === 'approved';
  if (filter === 'rejected') return status === 'rejected';
  return true;
}

function rowIsSelectable(row) {
  const status = String(row.adjustment_status || '').toLowerCase();
  return canRequestApproval() && (!status || status === 'rejected');
}

async function loadReconciliationApproval() {
  const tbody = document.getElementById('reconApprovalTableBody');
  const mobile = document.getElementById('reconApprovalMobile');
  const teamId = state.currentTeam?.team_id;
  if (!teamId) return;

  const { fromDate, toDate } = resolveDateRange();
  const statusFilter = document.getElementById('reconApprovalStatus')?.value || 'available';
  const colSpan = canRequestApproval() ? 8 : 7;

  if (tbody) tbody.innerHTML = `<tr><td colspan="${colSpan}" class="empty-state">Loading…</td></tr>`;
  if (mobile) mobile.innerHTML = '<p class="empty-state">Loading…</p>';

  try {
    const { data: submissions, error } = await supabaseClient
      .from('reconciliation_submissions')
      .select(`
        id, reconciliation_date,
        reconciliation_lines (
          id, bucket_id, bucket_name, currency,
          closing_balance, actual_balance, difference, comments, adjustment_status
        )
      `)
      .eq('team_id', teamId)
      .eq('is_deleted', false)
      .gte('reconciliation_date', fromDate)
      .lte('reconciliation_date', toDate)
      .order('reconciliation_date', { ascending: false });

    if (error) throw error;

    mismatchRows = [];
    (submissions || []).forEach(sub => {
      (sub.reconciliation_lines || []).forEach(line => {
        if (Math.abs(parseFloat(line.difference) || 0) < 0.01) return;
        if (!rowMatchesStatusFilter(line.adjustment_status, statusFilter)) return;
        mismatchRows.push({
          ...line,
          reconciliation_date: sub.reconciliation_date,
          submission_id: sub.id
        });
      });
    });

    mismatchRows.sort((a, b) => {
      if (a.reconciliation_date !== b.reconciliation_date) {
        return b.reconciliation_date.localeCompare(a.reconciliation_date);
      }
      return (a.bucket_name || '').localeCompare(b.bucket_name || '');
    });

    selectedLineIds = new Set([...selectedLineIds].filter(id => mismatchRows.some(r => r.id === id)));

    if (!mismatchRows.length) {
      const empty = '<p class="empty-state">No mismatched buckets for these filters.</p>';
      if (tbody) tbody.innerHTML = `<tr><td colspan="${colSpan}" class="empty-state">No mismatched buckets for these filters.</td></tr>`;
      if (mobile) mobile.innerHTML = empty;
      return;
    }

    let tableHtml = '';
    let mobileHtml = '';

    mismatchRows.forEach(row => {
      const { text: diffText, level: diffClass } = formatDifference(
        parseFloat(row.actual_balance),
        parseFloat(row.closing_balance),
        row.currency
      );
      const badge = statusLabel(row.adjustment_status);
      const selectable = rowIsSelectable(row);
      const checked = selectedLineIds.has(row.id) ? ' checked' : '';

      if (canRequestApproval()) {
        tableHtml += `
          <tr>
            <td data-label="Select">
              ${selectable
                ? `<input type="checkbox" data-line-id="${row.id}" onchange="window.toggleReconApprovalSelect('${row.id}', this.checked)"${checked}>`
                : ''}
            </td>
            <td data-label="Date">${formatDisplayDate(row.reconciliation_date)}</td>
            <td data-label="Bucket"><strong>${escapeHtml(row.bucket_name)}</strong></td>
            <td data-label="Balance">${fmtAmount(row.closing_balance)} ${row.currency || ''}</td>
            <td data-label="Actual">${fmtAmount(row.actual_balance)}</td>
            <td data-label="Difference" class="${diffClass}">${diffText}</td>
            <td data-label="Reason">${escapeHtml(row.comments || '—')}</td>
            <td data-label="Status"><span class="badge ${badge.class}">${badge.text}</span></td>
          </tr>
        `;
      } else {
        tableHtml += `
          <tr>
            <td data-label="Date">${formatDisplayDate(row.reconciliation_date)}</td>
            <td data-label="Bucket"><strong>${escapeHtml(row.bucket_name)}</strong></td>
            <td data-label="Balance">${fmtAmount(row.closing_balance)} ${row.currency || ''}</td>
            <td data-label="Actual">${fmtAmount(row.actual_balance)}</td>
            <td data-label="Difference" class="${diffClass}">${diffText}</td>
            <td data-label="Reason">${escapeHtml(row.comments || '—')}</td>
            <td data-label="Status"><span class="badge ${badge.class}">${badge.text}</span></td>
          </tr>
        `;
      }

      mobileHtml += `
        <article class="data-card data-card--compact">
          <div class="data-card-top">
            ${selectable ? `<label class="checkbox-label"><input type="checkbox" onchange="window.toggleReconApprovalSelect('${row.id}', this.checked)"${checked}> Select</label>` : ''}
            <span class="data-card-title">${escapeHtml(row.bucket_name)}</span>
            <span class="badge ${badge.class}">${badge.text}</span>
          </div>
          ${cardRow('Date', formatDisplayDate(row.reconciliation_date))}
          ${cardRow('Balance', `${fmtAmount(row.closing_balance)} ${row.currency || ''}`)}
          ${cardRow('Actual', fmtAmount(row.actual_balance))}
          ${cardRow('Difference', diffText, diffClass)}
          ${cardRow('Reason', row.comments || '—')}
        </article>
      `;
    });

    if (tbody) tbody.innerHTML = tableHtml;
    if (mobile) mobile.innerHTML = mobileHtml;

    const selectAll = document.getElementById('reconApprovalSelectAll');
    if (selectAll) {
      const selectableIds = mismatchRows.filter(rowIsSelectable).map(r => r.id);
      selectAll.checked = selectableIds.length > 0 && selectableIds.every(id => selectedLineIds.has(id));
    }
  } catch (err) {
    console.error('Reconciliation approval load:', err);
    const msg = escapeHtml(err.message);
    if (tbody) tbody.innerHTML = `<tr><td colspan="${colSpan}" class="empty-state" style="color:#dc3545;">${msg}</td></tr>`;
    if (mobile) mobile.innerHTML = `<p class="empty-state" style="color:#dc3545;">${msg}</p>`;
  }
}

function toggleReconApprovalSelect(lineId, checked) {
  if (checked) selectedLineIds.add(lineId);
  else selectedLineIds.delete(lineId);
}

function toggleReconApprovalSelectAll(checked) {
  if (checked) {
    mismatchRows.filter(rowIsSelectable).forEach(r => selectedLineIds.add(r.id));
  } else {
    mismatchRows.filter(rowIsSelectable).forEach(r => selectedLineIds.delete(r.id));
  }
  loadReconciliationApproval();
}

async function requestReconciliationApproval() {
  if (!canRequestApproval()) {
    showToast('You cannot request reconciliation approval on this team.', 'warning');
    return;
  }

  const ids = [...selectedLineIds];
  if (!ids.length) {
    showToast('Select at least one mismatched bucket', 'warning');
    return;
  }

  const teamId = state.currentTeam?.team_id;
  try {
    const request = await submitReconciliationAdjustment(ids, teamId);
    showToast(`Approval requested — ${request.request_number}`, 'success');
    selectedLineIds = new Set();
    await loadReconciliationApproval();
  } catch (err) {
    showToast(err.message || 'Failed to submit approval request', 'error');
  }
}
