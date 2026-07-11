// ==================== FINANCIAL STATUS & DAILY RECONCILIATION ====================
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

let cachedBuckets = [];
let cachedIncome = [];
let cachedExpenses = [];
let cachedTransfers = [];
let cachedRates = [];
let reportRows = [];
let lastFilters = { fromDate: '', toDate: '', scope: 'all' };

export function getFinancialStatusPage() {
  const teamName = state.currentTeam?.team_name || 'your team';
  const readOnly = !state.canSubmitReconciliation;
  const reconcileCard = readOnly ? `
    <div class="card">
      <p class="page-intro">Read-only view — daily reconciliation can be submitted by team members with write access (Member, Lead, or Team Admin).</p>
    </div>
  ` : `
    <div class="card">
      <div class="btn-group">
        <button type="button" id="showReconcileBtn" onclick="window.showReconcilePanel()">Reconcile</button>
      </div>
      <div id="reconcilePanel" style="display:none; margin-top:20px;">
        <h3>Daily Reconciliation — ${todayDateStr()}</h3>
        <p style="color:var(--text-secondary); font-size:0.9em; margin-bottom:12px;">
          Enter actual counts for every bucket with funds. Submit once to record today's reconciliation.
        </p>
        <div id="reconcileFormBody"></div>
        <div class="btn-group" style="margin-top:16px;">
          <button type="button" class="success" onclick="window.submitReconciliation()">Submit Reconciliation</button>
          <button type="button" class="secondary" onclick="window.hideReconcilePanel()">Cancel</button>
        </div>
      </div>
    </div>
  `;

  return `
    <h1 class="page-title">Financial Status</h1>
    <p style="color: var(--text-secondary); margin-bottom: 16px;">
      Daily reconciliation for <strong>${teamName}</strong>. One submission per day covers all team and personal buckets with funds.
    </p>
    ${readOnly ? '<p class="page-intro">Read-only access — you can generate reports and view reconciliation history.</p>' : ''}

    <div id="reconStatusBanner" class="dash-alert" style="margin-bottom:16px;">Loading…</div>

    <div class="card">
      <h2>Reconciliation Report</h2>
      <div class="filter-section">
        <div class="form-grid">
          <div class="form-group">
            <label>Scope</label>
            <select id="statusScope" onchange="window.onStatusScopeChange()">
              <option value="all">All</option>
              <option value="team">Team</option>
              <option value="personal">Personal</option>
            </select>
          </div>
          <div class="form-group">
            <label>Source (leave empty for all)</label>
            <select id="statusSource"><option value="">All Sources</option></select>
          </div>
          <div class="form-group"><label>Date From</label><input type="date" id="statusFrom"></div>
          <div class="form-group"><label>Date To</label><input type="date" id="statusTo"></div>
        </div>
        <div class="btn-group">
          <button type="button" onclick="window.generateFinancialStatus()">Generate Report</button>
          <button type="button" class="secondary" onclick="window.resetFinancialStatus()">Reset</button>
        </div>
      </div>
      <div id="financialStatusResults"></div>
    </div>

    ${reconcileCard}

    <div class="card">
      <h2>Reconciliation History</h2>
      <div class="table-container">
        <table>
          <thead>
            <tr><th>Date</th><th>Buckets</th><th>Submitted</th></tr>
          </thead>
          <tbody id="reconHistoryList">
            <tr><td colspan="3" class="empty-state">Loading…</td></tr>
          </tbody>
        </table>
      </div>
      <div id="reconHistoryDetail" style="display:none; margin-top:20px;"></div>
    </div>
  `;
}

export async function initFinancialStatusPage() {
  window.generateFinancialStatus = generateFinancialStatus;
  window.resetFinancialStatus = resetFinancialStatus;
  window.onStatusScopeChange = onStatusScopeChange;
  window.showReconcilePanel = showReconcilePanel;
  window.hideReconcilePanel = hideReconcilePanel;
  window.submitReconciliation = submitReconciliation;
  window.onReconcileActualInput = onReconcileActualInput;
  window.viewReconciliationHistory = viewReconciliationHistory;
  window.hideReconciliationHistory = hideReconciliationHistory;

  const teamId = state.currentTeam?.team_id;
  if (!teamId) return;

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

    populateSourceSelect();
    await loadReconciliationStatus();
    await loadReconciliationHistory();
  } catch (err) {
    console.error('Init financial status error:', err);
    showToast('Failed to load financial data', 'error');
  }
}

function getSelectedScope() {
  return document.getElementById('statusScope')?.value || 'all';
}

function formatReconAmount(amount) {
  const n = parseFloat(amount) || 0;
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function onStatusScopeChange() {
  populateSourceSelect();
  const results = document.getElementById('financialStatusResults');
  if (results) results.innerHTML = '';
  reportRows = [];
}

function populateSourceSelect() {
  const scope = getSelectedScope();
  const buckets = filterBucketsByScope(cachedBuckets, scope, state.user?.id);
  const select = document.getElementById('statusSource');
  if (!select) return;
  select.innerHTML = '<option value="">All Sources</option>';
  buckets.forEach(b => {
    select.innerHTML += `<option value="${b.id}">${b.name}</option>`;
  });
}

function getBucketsForFilter(scope, sourceId) {
  let buckets = filterBucketsByScope(cachedBuckets, scope, state.user?.id);
  if (sourceId) buckets = buckets.filter(b => b.id === sourceId);
  return buckets;
}

function generateFinancialStatus() {
  const scope = getSelectedScope();
  const fromDate = document.getElementById('statusFrom')?.value || '';
  const toDate = document.getElementById('statusTo')?.value || '';
  const sourceId = document.getElementById('statusSource')?.value || '';
  const asOfDate = toDate || todayDateStr();

  const buckets = getBucketsForFilter(scope, sourceId);
  reportRows = buckets.map(bucket => {
    const row = computeBucketStatusRow(
      bucket, fromDate, toDate, cachedIncome, cachedExpenses, cachedTransfers, cachedBuckets, cachedRates
    );
    return { ...row, bucket, scopeLabel: bucketScopeLabel(bucket) };
  });
  lastFilters = { fromDate, toDate, scope };

  const container = document.getElementById('financialStatusResults');
  if (!container) return;

  if (reportRows.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No buckets found for this scope.</p></div>';
    return;
  }

  let grandUsd = 0;
  let html = `
    <h3 style="margin-top:16px;">Financial Status as of ${asOfDate}</h3>
    <div class="table-container">
      <table class="status-table table-stack-mobile">
        <thead>
          <tr>
            <th>Type</th><th>Source</th><th>Currency</th><th>Opening</th><th>+ Income</th><th>+ Transfers In</th>
            <th>- Expenses</th><th>- Transfers Out</th><th>= Closing</th><th>USD Equiv</th>
          </tr>
        </thead>
        <tbody>
  `;

  reportRows.forEach(row => {
    if (row.closingUsd !== null) grandUsd += row.closingUsd;
    const closingClass = row.closing < 0 ? 'negative' : 'positive';
    const typeBadge = row.scopeLabel === 'Personal' ? 'warning' : 'info';
    html += `
      <tr>
        <td data-label="Type"><span class="badge badge-${typeBadge}">${row.scopeLabel}</span></td>
        <td data-label="Source"><strong>${row.bucketName}</strong></td>
        <td data-label="Currency"><span class="badge badge-info">${row.currency}</span></td>
        <td data-label="Opening">${row.opening.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td data-label="+ Income" class="positive">+${row.income.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td data-label="+ Transfers In" class="positive">+${row.transfersIn.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td data-label="- Expenses" class="negative">-${row.expenses.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td data-label="- Transfers Out" class="negative">-${row.transfersOut.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td data-label="Closing" class="${closingClass}"><strong>${row.closing.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
        <td data-label="USD Equiv" style="color:var(--primary);">${row.closingUsd !== null ? `$${row.closingUsd.toFixed(2)}` : '—'}</td>
      </tr>
    `;
  });

  html += `
      <tr class="status-total">
        <td data-label="Total USD Equivalent" colspan="9" style="text-align:right;"><strong>Total USD Equivalent:</strong></td>
        <td data-label="Amount" style="color:var(--primary);"><strong>$${grandUsd.toFixed(2)}</strong></td>
      </tr>
    </tbody></table></div>
    <div class="recon-help-box">
      ${state.canSubmitReconciliation
    ? '<strong>How to reconcile:</strong> Use the <strong>Reconcile</strong> button below to enter actual counts and submit one daily reconciliation.'
    : '<strong>Read-only:</strong> Reconciliation history is below. Submitting reconciliations requires Member, Lead, or Team Admin access.'}
    </div>
  `;

  container.innerHTML = html;
}

function resetFinancialStatus() {
  ['statusFrom', 'statusTo'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const scopeEl = document.getElementById('statusScope');
  if (scopeEl) scopeEl.value = 'all';
  const src = document.getElementById('statusSource');
  if (src) src.value = '';
  populateSourceSelect();
  const container = document.getElementById('financialStatusResults');
  if (container) container.innerHTML = '';
  reportRows = [];
  lastFilters = { fromDate: '', toDate: '', scope: 'all' };
}

function buildReconcileRows() {
  const today = todayDateStr();
  const fromDate = lastFilters.fromDate || today;
  const toDate = lastFilters.toDate || today;
  const rows = [];

  filterBucketsByScope(cachedBuckets, 'all').forEach(bucket => {
    const row = computeBucketStatusRow(
      bucket, fromDate, toDate, cachedIncome, cachedExpenses, cachedTransfers, cachedBuckets, cachedRates
    );
    if (bucketHasMoney(row)) {
      rows.push({ ...row, bucket, scopeLabel: bucketScopeLabel(bucket) });
    }
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
    await loadReconciliationHistory();
  } catch (err) {
    console.error('Submit reconciliation error:', err);
    showToast(err.message || 'Failed to submit reconciliation. Run migrations 005 and 007 if tables are missing.', 'error');
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

    banner.className = `dash-alert dash-alert--${status.level}`;
    banner.innerHTML = `<div class="dash-alert-body"><strong>Daily reconciliation</strong><span>${status.message}</span></div>`;
  } catch (err) {
    banner.className = 'dash-alert dash-alert--danger';
    banner.innerHTML = `<div class="dash-alert-body"><strong>Status unavailable</strong><span>${err.message}. Run migration 005 on Supabase.</span></div>`;
  }
}

async function loadReconciliationHistory() {
  const teamId = state.currentTeam?.team_id;
  const tbody = document.getElementById('reconHistoryList');
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
      tbody.innerHTML = '<tr><td colspan="3" class="empty-state">No reconciliation records yet.</td></tr>';
      return;
    }

    tbody.innerHTML = data.map(r => {
      const lineCount = r.reconciliation_lines?.length || 0;
      return `
        <tr class="row-clickable" data-recon-id="${r.id}" onclick="window.viewReconciliationHistory('${r.id}')">
          <td>${formatDisplayDate(r.reconciliation_date)}</td>
          <td>${lineCount} bucket${lineCount === 1 ? '' : 's'}</td>
          <td>${new Date(r.created_at).toLocaleString()}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="3" class="empty-state" style="color:#dc3545;">${err.message}</td></tr>`;
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

async function viewReconciliationHistory(submissionId) {
  const detail = document.getElementById('reconHistoryDetail');
  if (!detail) return;

  document.querySelectorAll('#reconHistoryList tr').forEach(row => {
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

    lines.forEach(line => {
      if (line.usd_equivalent !== null && line.usd_equivalent !== undefined) {
        grandUsd += parseFloat(line.usd_equivalent) || 0;
      }
      const scopeLabel = getBucketScopeLabel(line.bucket_id);
      const typeBadge = scopeLabel === 'Personal' ? 'warning' : 'info';
      const { text: diffText, level: diffLevel } = formatStoredDifference(line);
      const fmt = (n) => (parseFloat(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      rowsHtml += `
        <tr>
          <td data-label="Type"><span class="badge badge-${typeBadge}">${scopeLabel}</span></td>
          <td data-label="Bucket"><strong>${line.bucket_name}</strong></td>
          <td data-label="Currency">${line.currency}</td>
          <td data-label="Opening">${fmt(line.opening_balance)}</td>
          <td data-label="+ Income" class="positive">+${fmt(line.income_amount)}</td>
          <td data-label="+ Transfers In" class="positive">+${fmt(line.transfers_in)}</td>
          <td data-label="- Expenses" class="negative">-${fmt(line.expenses_amount)}</td>
          <td data-label="- Transfers Out" class="negative">-${fmt(line.transfers_out)}</td>
          <td data-label="Closing"><strong>${fmt(line.closing_balance)}</strong></td>
          <td data-label="Actual"><strong>${fmt(line.actual_balance)}</strong></td>
          <td data-label="Difference" class="${diffLevel}">${diffText}</td>
          <td data-label="USD Equiv" style="color:var(--primary);">${line.usd_equivalent !== null && line.usd_equivalent !== undefined ? `$${fmt(line.usd_equivalent)}` : '—'}</td>
          <td data-label="Comments">${line.comments || '—'}</td>
        </tr>
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
        <div class="table-container">
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
  document.querySelectorAll('#reconHistoryList tr.selected').forEach(row => row.classList.remove('selected'));
}
