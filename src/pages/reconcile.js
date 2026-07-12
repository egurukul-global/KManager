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
    <p class="page-intro">Daily reconciliation for <strong>${teamName}</strong>. Enter actual balances for buckets with funds and submit once per day. A comment is required when actual differs from balance.</p>
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

    <div class="card">
      <h2>Reconciliation History</h2>
      <div class="table-container show-desktop">
        <table class="table-stack-mobile">
          <thead>
            <tr><th>Date</th><th>Buckets</th><th>Submitted</th></tr>
          </thead>
          <tbody id="reconHistoryList">
            <tr><td colspan="3" class="empty-state">Loading…</td></tr>
          </tbody>
        </table>
      </div>
      <div id="reconHistoryMobile" class="show-mobile data-card-list"></div>
      <div id="reconHistoryDetail" style="display:none; margin-top:20px;"></div>
    </div>
  `;
}

export async function initReconcilePage() {
  window.showReconcilePanel = showReconcilePanel;
  window.hideReconcilePanel = hideReconcilePanel;
  window.submitReconciliation = submitReconciliation;
  window.onReconcileActualInput = onReconcileActualInput;
  window.viewReconciliationHistory = viewReconciliationHistory;
  window.hideReconciliationHistory = hideReconciliationHistory;
  window.toggleReconHistoryDetail = toggleReconHistoryDetail;
  window.syncReconcileField = syncReconcileField;

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
    await loadReconciliationHistory();
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

  let tableHtml = `
    <div class="table-container show-desktop">
      <table class="status-table recon-table table-stack-mobile">
        <thead>
          <tr>
            <th>Type</th><th>Bucket</th><th>Currency</th><th>Balance</th>
            <th>Actual</th><th>Difference</th><th>USD Equiv</th><th>Comments</th>
          </tr>
        </thead>
        <tbody>
  `;
  let mobileHtml = '<div class="show-mobile recon-cards-list">';

  rows.forEach((row, index) => {
    const typeBadge = row.scopeLabel === 'Personal' ? 'warning' : 'info';
    tableHtml += `
      <tr>
        <td data-label="Type"><span class="badge badge-${typeBadge}">${row.scopeLabel}</span></td>
        <td data-label="Bucket"><strong>${row.bucketName}</strong></td>
        <td data-label="Currency">${row.currency}</td>
        <td data-label="Balance">${formatReconAmount(row.closing)}</td>
        <td data-label="Actual">
          <input type="number" id="reconActual_${index}" step="0.01" placeholder="Amount"
            class="recon-actual-input" data-index="${index}" data-closing="${row.closing}" data-currency="${row.currency}"
            oninput="window.onReconcileActualInput(${index})">
        </td>
        <td data-label="Difference"><span id="reconDiff_${index}">—</span></td>
        <td data-label="USD Equiv">${row.closingUsd !== null ? `$${row.closingUsd.toFixed(2)}` : '—'}</td>
        <td data-label="Comments">
          <textarea id="reconComments_${index}" rows="2" placeholder="Required if difference ≠ 0" class="recon-comments-input"
            oninput="window.syncReconcileField(${index}, 'comments', false)"></textarea>
        </td>
      </tr>
    `;

    mobileHtml += `
      <article class="recon-entry-card data-card" data-recon-index="${index}">
        <div class="data-card-top">
          <span class="data-card-title">${row.bucketName}</span>
          <span class="badge badge-${typeBadge}">${row.scopeLabel}</span>
        </div>
        ${cardRow('Currency', row.currency)}
        ${cardRow('Balance', formatReconAmount(row.closing))}
        <div class="data-card-row recon-field-row">
          <span class="data-card-row-label">Actual</span>
          <input type="number" id="reconActual_m_${index}" step="0.01" placeholder="Amount"
            class="recon-actual-input" data-index="${index}" data-closing="${row.closing}" data-currency="${row.currency}"
            oninput="window.onReconcileActualInput(${index}, true)">
        </div>
        <div class="data-card-row">
          <span class="data-card-row-label">Difference</span>
          <span class="data-card-row-value" id="reconDiff_m_${index}">—</span>
        </div>
        ${cardRow('USD Equiv', row.closingUsd !== null ? `$${row.closingUsd.toFixed(2)}` : '—')}
        <div class="data-card-row recon-field-row recon-field-row--stacked">
          <span class="data-card-row-label">Comments</span>
          <textarea id="reconComments_m_${index}" rows="2" placeholder="Required if difference ≠ 0" class="recon-comments-input"
            oninput="window.syncReconcileField(${index}, 'comments', true)"></textarea>
        </div>
      </article>
    `;
  });

  tableHtml += '</tbody></table></div>';
  mobileHtml += '</div>';
  body.innerHTML = tableHtml + mobileHtml;
  panel.style.display = '';
  panel._reconcileRows = rows;
}

function hideReconcilePanel() {
  const panel = document.getElementById('reconcilePanel');
  if (panel) panel.style.display = 'none';
}

function getReconcileInput(index, field = 'actual', mobile = false) {
  const suffix = mobile ? '_m' : '';
  const id = field === 'comments' ? `reconComments${suffix}_${index}` : `reconActual${suffix}_${index}`;
  return document.getElementById(id);
}

function syncReconcileField(index, field, fromMobile = false) {
  const src = getReconcileInput(index, field, fromMobile);
  const dest = getReconcileInput(index, field, !fromMobile);
  if (src && dest && src !== dest) dest.value = src.value;
}

function onReconcileActualInput(index, fromMobile = false) {
  const input = getReconcileInput(index, 'actual', fromMobile);
  if (fromMobile) syncReconcileField(index, 'actual', true);

  const diffCell = document.getElementById(`reconDiff_${index}`);
  const diffCellMobile = document.getElementById(`reconDiff_m_${index}`);
  const activeInput = getReconcileInput(index, 'actual', fromMobile) || getReconcileInput(index, 'actual', false);
  if (!activeInput) return;

  const closing = parseFloat(activeInput.dataset.closing) || 0;
  const currency = activeInput.dataset.currency || '';
  const actual = parseFloat(activeInput.value);

  const applyDiff = (cell) => {
    if (!cell) return;
    if (Number.isNaN(actual)) {
      cell.textContent = '—';
      cell.className = cell.classList.contains('data-card-row-value') ? 'data-card-row-value' : '';
      cell.title = '';
      return;
    }
    const { text, level } = formatDifference(actual, closing, currency);
    cell.textContent = text;
    cell.title = text;
    if (cell.classList.contains('data-card-row-value')) {
      cell.className = `data-card-row-value ${level}`;
    } else {
      cell.className = level;
    }
  };

  applyDiff(diffCell);
  applyDiff(diffCellMobile);
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
    const actualInput = getReconcileInput(i, 'actual', false) || getReconcileInput(i, 'actual', true);
    const actualRaw = actualInput?.value;
    if (actualRaw === '' || actualRaw === undefined) {
      showToast(`Enter actual balance for ${row.bucketName}.`, 'error');
      return;
    }
    const actual = parseFloat(actualRaw);
    const comments = (
      document.getElementById(`reconComments_${i}`)?.value ||
      document.getElementById(`reconComments_m_${i}`)?.value ||
      ''
    ).trim();
    const { diff } = formatDifference(actual, row.closing, row.currency);
    if (Math.abs(diff) >= 0.01 && !comments) {
      showToast(`Add a comment for ${row.bucketName} — actual differs from balance.`, 'error');
      return;
    }
    lineData.push({ row, actual, difference: diff, comments: comments || null });
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
    await loadReconciliationHistory();
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

function toggleReconHistoryDetail(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.toggle('is-open');
    const trigger = el.closest('.data-card--expandable')?.querySelector('.data-card-expand-trigger');
    if (trigger) trigger.setAttribute('aria-expanded', el.classList.contains('is-open') ? 'true' : 'false');
  }
}

function formatStoredDifference(line) {
  const { text, level } = formatDifference(line.actual_balance, line.closing_balance, line.currency);
  return { text, level };
}

function getBucketScopeLabel(bucketId) {
  const bucket = cachedBuckets.find(b => b.id === bucketId);
  return bucket ? bucketScopeLabel(bucket) : 'Team';
}

async function loadReconciliationHistory() {
  const teamId = state.currentTeam?.team_id;
  const tbody = document.getElementById('reconHistoryList');
  const mobile = document.getElementById('reconHistoryMobile');
  if (!teamId || !tbody) return;

  try {
    const { data, error } = await supabaseClient
      .from('reconciliation_submissions')
      .select(`
        id, reconciliation_date, scope, created_at,
        reconciliation_lines ( id )
      `)
      .eq('team_id', teamId)
      .eq('is_deleted', false)
      .in('scope', ['all', 'team'])
      .order('reconciliation_date', { ascending: false })
      .limit(30);

    if (error) throw error;

    if (!data?.length) {
      const empty = '<tr><td colspan="3" class="empty-state">No reconciliation records yet.</td></tr>';
      tbody.innerHTML = empty;
      if (mobile) mobile.innerHTML = '<p class="empty-state">No reconciliation records yet.</p>';
      return;
    }

    let mobileHtml = '';
    tbody.innerHTML = data.map(r => {
      const lineCount = r.reconciliation_lines?.length || 0;
      const submitted = new Date(r.created_at).toLocaleString();
      mobileHtml += `
        <article class="data-card data-card--compact data-card--clickable" data-recon-id="${r.id}" onclick="window.viewReconciliationHistory('${r.id}')">
          <div class="data-card-top">
            <span class="data-card-title">${formatDisplayDate(r.reconciliation_date)}</span>
            <span class="badge badge-info">${lineCount} bucket${lineCount === 1 ? '' : 's'}</span>
          </div>
          ${cardRow('Submitted', submitted)}
        </article>
      `;
      return `
        <tr class="row-clickable" data-recon-id="${r.id}" onclick="window.viewReconciliationHistory('${r.id}')">
          <td data-label="Date">${formatDisplayDate(r.reconciliation_date)}</td>
          <td data-label="Buckets">${lineCount} bucket${lineCount === 1 ? '' : 's'}</td>
          <td data-label="Submitted">${submitted}</td>
        </tr>
      `;
    }).join('');
    if (mobile) mobile.innerHTML = mobileHtml;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="3" class="empty-state" style="color:#dc3545;">${err.message}</td></tr>`;
    if (mobile) mobile.innerHTML = `<p class="empty-state" style="color:#dc3545;">${err.message}</p>`;
  }
}

async function viewReconciliationHistory(submissionId) {
  const detail = document.getElementById('reconHistoryDetail');
  if (!detail) return;

  document.querySelectorAll('#reconHistoryList tr, #reconHistoryMobile .data-card').forEach(row => {
    row.classList.toggle('selected', row.dataset.reconId === submissionId);
  });

  detail.style.display = '';
  detail.innerHTML = '<p class="empty-state">Loading stored reconciliation…</p>';

  try {
    const { data, error } = await supabaseClient
      .from('reconciliation_submissions')
      .select(`
        id, reconciliation_date, created_at,
        reconciliation_lines (
          bucket_id, bucket_name, currency,
          opening_balance, income_amount, transfers_in,
          expenses_amount, transfers_out, closing_balance,
          actual_balance, difference, usd_equivalent, comments
        )
      `)
      .eq('id', submissionId)
      .eq('is_deleted', false)
      .single();

    if (error) throw error;

    const lines = [...(data.reconciliation_lines || [])].sort((a, b) =>
      (a.bucket_name || '').localeCompare(b.bucket_name || '')
    );

    if (!lines.length) {
      detail.innerHTML = `
        <div class="recon-history-detail">
          <div class="btn-group" style="margin-bottom:12px;">
            <button type="button" class="secondary" onclick="window.hideReconciliationHistory()">Close</button>
          </div>
          <p class="empty-state">No bucket lines stored for this reconciliation.</p>
        </div>
      `;
      return;
    }

    let grandUsd = 0;
    let rowsHtml = '';
    let mobileLines = '';

    lines.forEach((line, idx) => {
      if (line.usd_equivalent !== null && line.usd_equivalent !== undefined) {
        grandUsd += parseFloat(line.usd_equivalent) || 0;
      }
      const scopeLabel = getBucketScopeLabel(line.bucket_id);
      const typeBadge = scopeLabel === 'Personal' ? 'warning' : 'info';
      const { text: diffText, level: diffLevel } = formatStoredDifference(line);

      rowsHtml += `
        <tr>
          <td data-label="Type"><span class="badge badge-${typeBadge}">${scopeLabel}</span></td>
          <td data-label="Bucket"><strong>${line.bucket_name}</strong></td>
          <td data-label="Currency">${line.currency}</td>
          <td data-label="Opening">${formatReconAmount(line.opening_balance)}</td>
          <td data-label="+ Income" class="positive">+${formatReconAmount(line.income_amount)}</td>
          <td data-label="+ Transfers In" class="positive">+${formatReconAmount(line.transfers_in)}</td>
          <td data-label="- Expenses" class="negative">-${formatReconAmount(line.expenses_amount)}</td>
          <td data-label="- Transfers Out" class="negative">-${formatReconAmount(line.transfers_out)}</td>
          <td data-label="Closing"><strong>${formatReconAmount(line.closing_balance)}</strong></td>
          <td data-label="Actual"><strong>${formatReconAmount(line.actual_balance)}</strong></td>
          <td data-label="Difference" class="${diffLevel}">${diffText}</td>
          <td data-label="USD Equiv" style="color:var(--primary);">${line.usd_equivalent !== null && line.usd_equivalent !== undefined ? `$${formatReconAmount(line.usd_equivalent)}` : '—'}</td>
          <td data-label="Comments">${line.comments || '—'}</td>
        </tr>
      `;

      mobileLines += `
        <article class="data-card data-card--compact data-card--expandable">
          <button type="button" class="data-card-expand-trigger" onclick="window.toggleReconHistoryDetail('reconHist_${idx}')" aria-controls="reconHist_${idx}">
            <div class="data-card-top">
              <span class="data-card-title">${line.bucket_name}</span>
              <span class="badge badge-${typeBadge}">${scopeLabel}</span>
            </div>
            ${cardRow('Actual', formatReconAmount(line.actual_balance))}
            ${cardRow('Difference', diffText, diffLevel)}
            <span class="data-card-expand-hint">Tap for breakdown</span>
          </button>
          <div id="reconHist_${idx}" class="data-card-detail">
            ${cardRow('Closing', formatReconAmount(line.closing_balance))}
            ${line.comments ? cardRow('Comments', line.comments) : ''}
          </div>
        </article>
      `;
    });

    detail.innerHTML = `
      <div class="recon-history-detail">
        <div class="btn-group" style="margin-bottom:12px;">
          <button type="button" class="secondary" onclick="window.hideReconciliationHistory()">Close</button>
        </div>
        <h3>Reconciliation — ${formatDisplayDate(data.reconciliation_date)}</h3>
        <p style="color:var(--text-secondary); font-size:0.9em; margin-bottom:12px;">
          Submitted ${new Date(data.created_at).toLocaleString()} (read-only)
        </p>
        <div class="table-container show-desktop">
          <table class="status-table recon-table table-stack-mobile">
            <thead>
              <tr>
                <th>Type</th><th>Bucket</th><th>Currency</th><th>Opening</th><th>+ Income</th><th>+ Transfers In</th>
                <th>- Expenses</th><th>- Transfers Out</th><th>Closing</th><th>Actual</th>
                <th>Difference</th><th>USD Equiv</th><th>Comments</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
              <tr class="status-total">
                <td data-label="Total USD Equivalent" colspan="11" style="text-align:right;"><strong>Total USD Equivalent:</strong></td>
                <td data-label="Amount" style="color:var(--primary);"><strong>$${grandUsd.toFixed(2)}</strong></td>
                <td data-label=""></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="show-mobile data-card-list">${mobileLines}</div>
        <article class="show-mobile data-card data-card--total">
          ${cardRow('Total USD Equivalent', `$${grandUsd.toFixed(2)}`)}
        </article>
      </div>
    `;
  } catch (err) {
    console.error('View reconciliation history error:', err);
    detail.innerHTML = `
      <div class="recon-history-detail">
        <div class="btn-group" style="margin-bottom:12px;">
          <button type="button" class="secondary" onclick="window.hideReconciliationHistory()">Close</button>
        </div>
        <p class="empty-state" style="color:#dc3545;">${err.message}</p>
      </div>
    `;
  }
}

function hideReconciliationHistory() {
  const detail = document.getElementById('reconHistoryDetail');
  if (detail) {
    detail.style.display = 'none';
    detail.innerHTML = '';
  }
  document.querySelectorAll('#reconHistoryList tr.selected, #reconHistoryMobile .data-card.selected').forEach(row => {
    row.classList.remove('selected');
  });
}
