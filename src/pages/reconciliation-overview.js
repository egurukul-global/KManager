// ==================== RECONCILIATION OVERVIEW (Phase 4A) ====================
import { state } from '../state.js';
import { supabaseClient, sbSelect } from '../db.js';
import { showToast } from '../components/toasts.js';
import { cardRow } from '../utils/uiHelpers.js';
import { teamAccessLabel, isOplOrAbove } from '../utils/roleLabels.js';
import {
  bucketsRequiredForTeamReconcile,
  computeTeamReconcileProgress,
  bucketNeedsReconcile
} from '../utils/reconcileScope.js';
import { canAccessPage } from '../utils/navPermissions.js';
import { formatDisplayDate, todayDateStr } from '../utils/budgetCalendar.js';
import { formatDifference } from '../utils/financialStatusHelpers.js';

let overviewRows = [];
let detailRowId = null;

export function getReconciliationOverviewPage() {
  return `
    <h1 class="page-title">Overview</h1>
    <p class="page-intro">Reconciliation summary by team — click a row for bucket-level detail. Access limits what you see.</p>

    <div class="card">
      <h2>Filters</h2>
      <div class="form-grid">
        <div class="form-group">
          <label>Team</label>
          <select id="reconOverviewTeam" onchange="window.initReconciliationOverviewPage()">
            <option value="all">All teams</option>
          </select>
        </div>
        <div class="form-group">
          <label>Date</label>
          <input type="date" id="reconOverviewDate" onchange="window.initReconciliationOverviewPage()">
        </div>
        <div class="form-group">
          <label>Status</label>
          <select id="reconOverviewStatus" onchange="window.initReconciliationOverviewPage()">
            <option value="all">All</option>
            <option value="complete">Complete</option>
            <option value="pending">Pending</option>
          </select>
        </div>
        <div class="form-group">
          <label>Discrepancy</label>
          <select id="reconOverviewDiscrepancy" onchange="window.initReconciliationOverviewPage()">
            <option value="all">All</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>
      </div>
      <div class="btn-group">
        <button type="button" onclick="window.initReconciliationOverviewPage()">Refresh</button>
      </div>
    </div>

    <div class="card">
      <h2>Summary</h2>
      <div class="table-container show-desktop">
        <table class="table-stack-mobile" id="reconOverviewTable">
          <thead>
            <tr>
              <th>Team</th>
              <th>Date</th>
              <th>Progress</th>
              <th>Status</th>
              <th>Discrepancy</th>
              <th>Awaiting</th>
            </tr>
          </thead>
          <tbody id="reconOverviewTableBody">
            <tr><td colspan="6" class="empty-state">Loading…</td></tr>
          </tbody>
        </table>
      </div>
      <div id="reconOverviewSummary" class="show-mobile data-card-list"></div>
    </div>
    <div id="reconOverviewDetail" style="display:none; margin-top:16px;"></div>
  `;
}

export async function initReconciliationOverviewPage() {
  window.initReconciliationOverviewPage = initReconciliationOverviewPage;
  window.toggleReconOverviewDetail = toggleReconOverviewDetail;
  window.closeReconOverviewDetail = closeReconOverviewDetail;

  const dateEl = document.getElementById('reconOverviewDate');
  if (dateEl && !dateEl.value) dateEl.value = todayDateStr();

  populateTeamFilter();
  await loadOverview();
}

function populateTeamFilter() {
  const select = document.getElementById('reconOverviewTeam');
  if (!select) return;
  const current = select.value || 'all';
  select.innerHTML = '<option value="all">All teams</option>';
  (state.teams || []).forEach(t => {
    select.innerHTML += `<option value="${t.team_id}">${t.team_name}</option>`;
  });
  select.value = current;
}

async function loadOverview() {
  const summaryEl = document.getElementById('reconOverviewSummary');
  const tableBody = document.getElementById('reconOverviewTableBody');
  if (!summaryEl && !tableBody) return;

  const teamFilter = document.getElementById('reconOverviewTeam')?.value || 'all';
  const date = document.getElementById('reconOverviewDate')?.value || todayDateStr();
  const statusFilter = document.getElementById('reconOverviewStatus')?.value || 'all';
  const discrepancyFilter = document.getElementById('reconOverviewDiscrepancy')?.value || 'all';

  const loading = '<p class="empty-state">Loading…</p>';
  if (summaryEl) summaryEl.innerHTML = loading;
  if (tableBody) tableBody.innerHTML = '<tr><td colspan="6" class="empty-state">Loading…</td></tr>';

  try {
    const teams = teamFilter === 'all'
      ? (state.teams || [])
      : (state.teams || []).filter(t => t.team_id === teamFilter);

    overviewRows = [];

    for (const team of teams) {
      const row = await buildTeamOverviewRow(team, date);
      if (!row) continue;

      if (statusFilter === 'complete' && row.progress.pending > 0) continue;
      if (statusFilter === 'pending' && row.progress.pending === 0 && row.progress.required > 0) continue;
      if (discrepancyFilter === 'yes' && !row.hasDiscrepancy) continue;
      if (discrepancyFilter === 'no' && row.hasDiscrepancy) continue;

      overviewRows.push(row);
    }

    if (!overviewRows.length) {
      const empty = '<p class="empty-state">No reconciliation data for these filters.</p>';
      if (summaryEl) summaryEl.innerHTML = empty;
      if (tableBody) tableBody.innerHTML = '<tr><td colspan="6" class="empty-state">No reconciliation data for these filters.</td></tr>';
      closeReconOverviewDetail();
      return;
    }

    let tableHtml = '';
    let mobileHtml = '';

    overviewRows.forEach((row, idx) => {
      const statusClass = row.progress.pending === 0 && row.progress.required > 0 ? 'badge-success' : 'badge-warning';
      const statusText = row.progress.required === 0
        ? 'No buckets need reconcile'
        : row.progress.pending === 0
          ? 'Complete'
          : 'Pending';
      const awaiting = row.pendingMembers.length ? row.pendingMembers.join(', ') : '—';
      const discrepancy = row.hasDiscrepancy ? 'Yes' : 'No';
      const discClass = row.hasDiscrepancy ? 'negative' : '';

      tableHtml += `
        <tr class="row-clickable" onclick="window.toggleReconOverviewDetail(${idx})">
          <td data-label="Team"><strong>${row.teamName}</strong></td>
          <td data-label="Date">${formatDisplayDate(date)}</td>
          <td data-label="Progress">${row.progress.label}</td>
          <td data-label="Status"><span class="badge ${statusClass}">${statusText}</span></td>
          <td data-label="Discrepancy" class="${discClass}">${discrepancy}</td>
          <td data-label="Awaiting">${awaiting}</td>
        </tr>
      `;

      mobileHtml += `
        <article class="data-card data-card--compact data-card--clickable" onclick="window.toggleReconOverviewDetail(${idx})">
          <div class="data-card-top">
            <span class="data-card-title">${row.teamName}</span>
            <span class="badge ${statusClass}">${statusText}</span>
          </div>
          ${cardRow('Date', formatDisplayDate(date))}
          ${cardRow('Progress', row.progress.label)}
          ${cardRow('Your access', teamAccessLabel(row.accessLevel))}
          ${row.hasDiscrepancy ? cardRow('Discrepancy', 'Yes', 'negative') : cardRow('Discrepancy', 'No')}
          ${row.pendingMembers.length ? `<p class="data-card-hint">Awaiting: ${row.pendingMembers.join(', ')}</p>` : ''}
          <span class="data-card-expand-hint">Tap for bucket detail</span>
        </article>
      `;
    });

    if (tableBody) tableBody.innerHTML = tableHtml;
    if (summaryEl) summaryEl.innerHTML = mobileHtml;
  } catch (err) {
    console.error('Reconciliation overview:', err);
    const errMsg = err.message;
    if (summaryEl) summaryEl.innerHTML = `<p class="empty-state" style="color:#dc3545;">${errMsg}</p>`;
    if (tableBody) tableBody.innerHTML = `<tr><td colspan="6" class="empty-state" style="color:#dc3545;">${errMsg}</td></tr>`;
  }
}

async function buildTeamOverviewRow(team, date) {
  const teamId = team.team_id;
  let isPersonal = !!team.is_personal_team;

  if (team.is_personal_team === undefined) {
    const { data: teamMeta } = await supabaseClient
      .from('teams')
      .select('is_personal_team')
      .eq('id', teamId)
      .maybeSingle();
    isPersonal = !!teamMeta?.is_personal_team;
  }

  const { data: buckets, error: bucketsError } = await sbSelect('buckets', {
    teamId,
    orderBy: 'name',
    ascending: true
  });
  if (bucketsError) throw bucketsError;

  const level = String(team.access_level || 'member').toLowerCase();
  let visibleBuckets = buckets || [];

  if (level === 'member' && !isPersonal) {
    visibleBuckets = visibleBuckets.filter(b => b.owner_user_id === state.user?.id);
  }

  const required = isPersonal
    ? visibleBuckets.filter(bucketNeedsReconcile)
    : bucketsRequiredForTeamReconcile(buckets, teamId);

  const { data: submissions } = await supabaseClient
    .from('reconciliation_submissions')
    .select(`
      id,
      reconciliation_lines ( bucket_id, actual_balance, closing_balance, currency, comments, bucket_name, difference )
    `)
    .eq('team_id', teamId)
    .eq('reconciliation_date', date)
    .eq('is_deleted', false);

  const reconciledIds = new Set();
  const lineDetails = [];
  let hasDiscrepancy = false;

  (submissions || []).forEach(sub => {
    (sub.reconciliation_lines || []).forEach(line => {
      reconciledIds.add(line.bucket_id);
      const diff = parseFloat(line.difference);
      if (Math.abs(diff) >= 0.01) hasDiscrepancy = true;
      lineDetails.push(line);
    });
  });

  const progress = computeTeamReconcileProgress(required, [...reconciledIds]);

  let pendingMembers = [];
  if (isOplOrAbove(level) && progress.pendingOwnerIds.length) {
    const { data: users } = await supabaseClient
      .from('users')
      .select('id, name')
      .in('id', progress.pendingOwnerIds);
    pendingMembers = (users || []).map(u => u.name || u.id.slice(0, 8));
  }

  if (level === 'member' && !isPersonal && required.length === 0 && visibleBuckets.length === 0) {
    return null;
  }

  return {
    teamId,
    teamName: team.team_name,
    accessLevel: level,
    isPersonal,
    progress,
    hasDiscrepancy,
    pendingMembers,
    required,
    lineDetails,
    reconciledIds
  };
}

function toggleReconOverviewDetail(index) {
  const row = overviewRows[index];
  const detailEl = document.getElementById('reconOverviewDetail');
  if (!row || !detailEl) return;

  if (detailRowId === index) {
    closeReconOverviewDetail();
    return;
  }
  detailRowId = index;
  detailEl.style.display = '';

  let linesHtml = '';
  row.required.forEach((bucket, i) => {
    const line = row.lineDetails.find(l => l.bucket_id === bucket.id);
    const reconciled = row.reconciledIds.has(bucket.id);
    let diffText = '—';
    let diffClass = '';
    if (line) {
      const { text, level } = formatDifference(
        parseFloat(line.actual_balance),
        parseFloat(line.closing_balance),
        line.currency || bucket.currency
      );
      diffText = text;
      diffClass = level;
    }

    linesHtml += `
      <article class="data-card data-card--compact">
        <div class="data-card-top">
          <span class="data-card-title">${bucket.name}</span>
          <span class="badge ${reconciled ? 'badge-success' : 'badge-warning'}">${reconciled ? 'Done' : 'Pending'}</span>
        </div>
        ${cardRow('Balance', (parseFloat(bucket.balance) || 0).toFixed(2) + ' ' + (bucket.currency || ''))}
        ${line ? cardRow('Actual', line.actual_balance) : ''}
        ${line ? cardRow('Difference', diffText, diffClass) : ''}
        ${line?.comments ? cardRow('Comments', line.comments) : ''}
      </article>
    `;
  });

  detailEl.innerHTML = `
    <div class="card">
      <div class="btn-group" style="margin-bottom:12px;">
        <button type="button" class="secondary" onclick="window.closeReconOverviewDetail()">Close detail</button>
        ${canAccessPage('reconcile') ? '<button type="button" onclick="window.showPage(\'reconcile\')">Open Reconcile</button>' : ''}
        ${canAccessPage('financial-status') ? '<button type="button" class="secondary" onclick="window.showPage(\'financial-status\')">Open Treasury</button>' : ''}
      </div>
      <h3>${row.teamName} — ${formatDisplayDate(document.getElementById('reconOverviewDate')?.value || todayDateStr())}</h3>
      <div class="show-mobile data-card-list">${linesHtml || '<p class="empty-state">No buckets require reconciliation.</p>'}</div>
      <div class="table-container show-desktop">
        <table class="table-stack-mobile">
          <thead><tr><th>Bucket</th><th>Status</th><th>Balance</th><th>Actual</th><th>Diff</th><th>Comments</th></tr></thead>
          <tbody>
            ${row.required.map(bucket => {
              const line = row.lineDetails.find(l => l.bucket_id === bucket.id);
              const reconciled = row.reconciledIds.has(bucket.id);
              return `<tr>
                <td data-label="Bucket">${bucket.name}</td>
                <td data-label="Status">${reconciled ? 'Done' : 'Pending'}</td>
                <td data-label="Balance">${(parseFloat(bucket.balance) || 0).toFixed(2)}</td>
                <td data-label="Actual">${line?.actual_balance ?? '—'}</td>
                <td data-label="Diff">${line?.difference ?? '—'}</td>
                <td data-label="Comments">${line?.comments || '—'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function closeReconOverviewDetail() {
  detailRowId = null;
  const detailEl = document.getElementById('reconOverviewDetail');
  if (detailEl) {
    detailEl.style.display = 'none';
    detailEl.innerHTML = '';
  }
}
