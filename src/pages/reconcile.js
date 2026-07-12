// ==================== DAILY RECONCILE (Financials → Reconciliation) ====================
import { state } from '../state.js';
import { supabaseClient, sbSelect } from '../db.js';
import { showToast } from '../components/toasts.js';
import { cardRow } from '../utils/uiHelpers.js';
import {
  getDailyReconciliationStatus,
  formatDisplayDate,
  todayDateStr
} from '../utils/budgetCalendar.js';
import {
  computeBucketStatusRow,
  filterBucketsByScope,
  bucketHasMoney,
  bucketScopeLabel,
  formatDifference
} from '../utils/financialStatusHelpers.js';
import {
  bucketsForReconcileSubmit,
  bucketsRequiredForTeamReconcile,
  computeTeamReconcileProgress
} from '../utils/reconcileScope.js';
import { isOplOrAbove } from '../utils/roleLabels.js';

let cachedBuckets = [];
let cachedIncome = [];
let cachedExpenses = [];
let cachedTransfers = [];
let cachedRates = [];
let lastFilters = { fromDate: '', toDate: '', scope: 'all' };

export function getReconcilePage() {
  const teamName = state.currentTeam?.team_name || 'your team';
  const readOnly = !state.canSubmitReconciliation;

  return `
    <h1 class="page-title">Reconcile</h1>
    <p class="page-intro">Daily reconciliation for <strong>${teamName}</strong>. Enter actual balances for buckets with funds and submit once per day.</p>
    ${readOnly ? '<p class="page-intro">Read-only — you cannot submit reconciliations on this team.</p>' : ''}

    <div id="reconStatusBanner" class="dash-alert" style="margin-bottom:16px;">Loading…</div>

    ${readOnly ? '' : `
    <div class="card">
      <div class="btn-group">
        <button type="button" id="showReconcileBtn" onclick="window.showReconcilePanel()">Start reconciliation</button>
      </div>
      <div id="reconcilePanel" style="display:none; margin-top:20px;">
        <h3>Daily Reconciliation — ${todayDateStr()}</h3>
        <p style="color:var(--text-secondary); font-size:0.9em; margin-bottom:12px;">
          Enter actual counts for every bucket you must reconcile. Submit once to record today's reconciliation.
        </p>
        <div id="reconcileFormBody"></div>
        <div class="btn-group" style="margin-top:16px;">
          <button type="button" class="success" onclick="window.submitReconciliation()">Submit Reconciliation</button>
          <button type="button" class="secondary" onclick="window.hideReconcilePanel()">Cancel</button>
        </div>
      </div>
    </div>
    `}
  `;
}

export async function initReconcilePage() {
  window.showReconcilePanel = showReconcilePanel;
  window.hideReconcilePanel = hideReconcilePanel;
  window.submitReconciliation = submitReconciliation;
  window.onReconcileActualInput = onReconcileActualInput;

  const teamId = state.currentTeam?.team_id;
  if (!teamId) return;

  const today = todayDateStr();
  lastFilters = { fromDate: today, toDate: today, scope: 'all' };

  try {
    const [bucketsRes, incomeRes, expensesRes, transfersRes, ratesRes] = await Promise.all([
      sbSelect('buckets', { teamId, orderBy: 'name', ascending: true }),
      sbSelect('income', { teamId, orderBy: 'date', ascending: false }),
      sbSelect('expenses', { teamId, orderBy: 'date', ascending: false }),
      sbSelect('transfers', { teamId, orderBy: 'date', ascending: false }),
      sbSelect('exchange_rates', { teamId, orderBy: 'date', ascending: false })
    ]);

    cachedBuckets = bucketsRes.data || [];
    cachedIncome = incomeRes.data || [];
    cachedExpenses = expensesRes.data || [];
    cachedTransfers = transfersRes.data || [];
    cachedRates = ratesRes.data || [];

    await loadReconciliationStatus();
  } catch (err) {
    console.error('Init reconcile error:', err);
    showToast('Failed to load reconciliation data', 'error');
  }
}

function formatReconAmount(amount) {
  const n = parseFloat(amount) || 0;
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildReconcileRows() {
  const today = todayDateStr();
  const fromDate = lastFilters.fromDate || today;
  const toDate = lastFilters.toDate || today;
  const rows = [];

  bucketsForReconcileSubmit(cachedBuckets).forEach(bucket => {
    const row = computeBucketStatusRow(
      bucket, fromDate, toDate, cachedIncome, cachedExpenses, cachedTransfers, cachedBuckets, cachedRates
    );
    rows.push({ ...row, bucket, scopeLabel: bucketScopeLabel(bucket) });
  });

  return rows;
}

function showReconcilePanel() {
  if (!state.canSubmitReconciliation) {
    showToast('Read-only access — you cannot submit reconciliations on this team.', 'warning');
    return;
  }
  const panel = document.getElementById('reconcilePanel');
  const body = document.getElementById('reconcileFormBody');
  if (!panel || !body) return;

  const rows = buildReconcileRows();
  if (rows.length === 0) {
    showToast('No buckets with balances require reconciliation.', 'info');
    return;
  }

  let html = '<div class="recon-cards-list">';

  rows.forEach((row, index) => {
    const typeBadge = row.scopeLabel === 'Personal' ? 'warning' : 'info';
    html += `
      <article class="recon-entry-card data-card" data-recon-index="${index}">
        <div class="data-card-top">
          <span class="data-card-title">${row.bucketName}</span>
          <span class="badge badge-${typeBadge}">${row.scopeLabel}</span>
        </div>
        ${cardRow('Currency', row.currency)}
        ${cardRow('Balance', formatReconAmount(row.closing))}
        <div class="data-card-row recon-field-row">
          <span class="data-card-row-label">Actual</span>
          <input type="number" id="reconActual_${index}" step="0.01" placeholder="Amount"
            class="recon-actual-input" data-index="${index}" data-closing="${row.closing}" data-currency="${row.currency}"
            oninput="window.onReconcileActualInput(${index})">
        </div>
        <div class="data-card-row">
          <span class="data-card-row-label">Difference</span>
          <span class="data-card-row-value" id="reconDiff_${index}">—</span>
        </div>
        ${cardRow('USD Equiv', row.closingUsd !== null ? `$${row.closingUsd.toFixed(2)}` : '—')}
        <div class="data-card-row recon-field-row recon-field-row--stacked">
          <span class="data-card-row-label">Comments</span>
          <textarea id="reconComments_${index}" rows="2" placeholder="Reason (optional)" class="recon-comments-input"></textarea>
        </div>
      </article>
    `;
  });

  html += '</div>';
  body.innerHTML = html;
  panel.style.display = '';
  panel._reconcileRows = rows;
}

function hideReconcilePanel() {
  const panel = document.getElementById('reconcilePanel');
  if (panel) panel.style.display = 'none';
}

function onReconcileActualInput(index) {
  const input = document.getElementById(`reconActual_${index}`);
  const diffCell = document.getElementById(`reconDiff_${index}`);
  if (!input || !diffCell) return;

  const closing = parseFloat(input.dataset.closing) || 0;
  const currency = input.dataset.currency || '';
  const actual = parseFloat(input.value);

  if (Number.isNaN(actual)) {
    diffCell.textContent = '—';
    diffCell.className = 'data-card-row-value';
    diffCell.title = '';
    return;
  }

  const { text, level } = formatDifference(actual, closing, currency);
  diffCell.textContent = text;
  diffCell.title = text;
  diffCell.className = `data-card-row-value ${level}`;
}

async function submitReconciliation() {
  if (!state.canSubmitReconciliation) {
    showToast('Read-only access — you cannot submit reconciliations on this team.', 'warning');
    return;
  }
  const panel = document.getElementById('reconcilePanel');
  const rows = panel?._reconcileRows || buildReconcileRows();
  if (!rows.length) {
    showToast('Nothing to reconcile.', 'info');
    return;
  }

  const teamId = state.currentTeam?.team_id;
  const userId = state.user?.id;
  const reconciliationDate = todayDateStr();

  const lineData = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const actualInput = document.getElementById(`reconActual_${i}`);
    const commentsInput = document.getElementById(`reconComments_${i}`);
    const actualRaw = actualInput?.value;
    if (actualRaw === '' || actualRaw === undefined) {
      showToast(`Enter actual balance for ${row.bucketName}.`, 'error');
      return;
    }
    const actual = parseFloat(actualRaw);
    const { diff } = formatDifference(actual, row.closing, row.currency);
    lineData.push({ row, actual, difference: diff, comments: commentsInput?.value?.trim() || null });
  }

  try {
    const submissionPayload = {
      team_id: teamId,
      reconciliation_date: reconciliationDate,
      scope: 'all',
      user_id: null,
      created_by: userId,
      is_deleted: false
    };

    const { data: existing } = await supabaseClient
      .from('reconciliation_submissions')
      .select('id')
      .eq('team_id', teamId)
      .eq('reconciliation_date', reconciliationDate)
      .eq('scope', 'all')
      .eq('is_deleted', false)
      .maybeSingle();

    let submissionId = existing?.id;

    if (submissionId) {
      await supabaseClient.from('reconciliation_lines').delete().eq('submission_id', submissionId);
      await supabaseClient.from('reconciliation_submissions').update(submissionPayload).eq('id', submissionId);
    } else {
      const { data: inserted, error: insertErr } = await supabaseClient
        .from('reconciliation_submissions')
        .insert(submissionPayload)
        .select('id')
        .single();
      if (insertErr) throw insertErr;
      submissionId = inserted.id;
    }

    const linesPayload = lineData.map(({ row, actual, difference, comments }) => ({
      submission_id: submissionId,
      bucket_id: row.bucketId,
      bucket_name: row.bucketName,
      currency: row.currency,
      opening_balance: row.opening,
      income_amount: row.income,
      transfers_in: row.transfersIn,
      expenses_amount: row.expenses,
      transfers_out: row.transfersOut,
      closing_balance: row.closing,
      actual_balance: actual,
      difference,
      usd_equivalent: row.closingUsd,
      comments
    }));

    const { error: linesErr } = await supabaseClient.from('reconciliation_lines').insert(linesPayload);
    if (linesErr) throw linesErr;

    await supabaseClient.from('daily_reconciliation').upsert({
      team_id: teamId,
      reconciliation_date: reconciliationDate,
      notes: 'Daily reconciliation submitted',
      created_by: userId,
      is_deleted: false
    }, { onConflict: 'team_id,reconciliation_date' });

    showToast('Reconciliation submitted successfully', 'success');
    hideReconcilePanel();
    await loadReconciliationStatus();
  } catch (err) {
    console.error('Submit reconciliation error:', err);
    showToast(err.message || 'Failed to submit reconciliation.', 'error');
  }
}

async function loadReconciliationStatus() {
  const teamId = state.currentTeam?.team_id;
  const today = todayDateStr();
  const banner = document.getElementById('reconStatusBanner');
  if (!teamId || !banner) return;

  try {
    const required = filterBucketsByScope(cachedBuckets, 'all').some(b => {
      const row = computeBucketStatusRow(b, today, today, cachedIncome, cachedExpenses, cachedTransfers, cachedBuckets, cachedRates);
      return bucketHasMoney(row);
    });

    const { data: submissions } = await supabaseClient
      .from('reconciliation_submissions')
      .select('scope')
      .eq('team_id', teamId)
      .eq('reconciliation_date', today)
      .eq('is_deleted', false);

    const submittedToday = (submissions || []).some(s => s.scope === 'all' || s.scope === 'team');
    const status = getDailyReconciliationStatus({ submittedToday, required }, today);

    let html = `<div class="dash-alert-body"><strong>Daily reconciliation</strong><span>${status.message}</span></div>`;
    banner.className = `dash-alert dash-alert--${status.level}`;

    const level = String(state.userTeamAccess?.access_level || 'member').toLowerCase().trim();
    if (isOplOrAbove(level)) {
      const teamRequired = bucketsRequiredForTeamReconcile(cachedBuckets, teamId);
      if (teamRequired.length > 0) {
        const { data: subsWithLines } = await supabaseClient
          .from('reconciliation_submissions')
          .select('reconciliation_lines ( bucket_id )')
          .eq('team_id', teamId)
          .eq('reconciliation_date', today)
          .eq('is_deleted', false);

        const reconciledIds = [];
        (subsWithLines || []).forEach(sub => {
          (sub.reconciliation_lines || []).forEach(line => reconciledIds.push(line.bucket_id));
        });

        const progress = computeTeamReconcileProgress(teamRequired, reconciledIds);
        let pendingNames = '';
        if (progress.pendingOwnerIds.length) {
          const { data: users } = await supabaseClient
            .from('users')
            .select('id, name')
            .in('id', progress.pendingOwnerIds);
          pendingNames = (users || []).map(u => u.name || u.id.slice(0, 8)).join(', ');
        }

        const progressLevel = progress.pending === 0 ? 'success' : 'warning';
        html += `<div class="dash-alert dash-alert--${progressLevel}" style="margin-top:8px;">
          <div class="dash-alert-body"><strong>Team progress</strong><span>${progress.label} reconciled today${pendingNames ? ` — awaiting: ${pendingNames}` : ''}</span></div>
        </div>`;
      }
    }

    banner.innerHTML = html;
  } catch (err) {
    banner.className = 'dash-alert dash-alert--danger';
    banner.innerHTML = `<div class="dash-alert-body"><strong>Status unavailable</strong><span>${err.message}</span></div>`;
  }
}
