// ==================== TREASURY (reports & reconciliation history) ====================
import { state } from '../state.js';
import { supabaseClient, sbSelect } from '../db.js';
import { showToast } from '../components/toasts.js';
import { cardRow } from '../utils/uiHelpers.js';
import { formatDisplayDate, todayDateStr } from '../utils/budgetCalendar.js';
import {
  computeBucketStatusRow,
  filterBucketsByScope,
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

  return `
    <h1 class="page-title">Treasury</h1>
    <p class="page-intro">Bucket balances and reconciliation history for <strong>${teamName}</strong>. Submit daily reconciliations from <strong>Financials → Reconciliation → Reconcile</strong>.</p>

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

export async function initFinancialStatusPage() {
  window.generateFinancialStatus = generateFinancialStatus;
  window.resetFinancialStatus = resetFinancialStatus;
  window.onStatusScopeChange = onStatusScopeChange;
  window.viewReconciliationHistory = viewReconciliationHistory;
  window.hideReconciliationHistory = hideReconciliationHistory;
  window.toggleFinStatusDetail = toggleFinStatusDetail;

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
    await loadReconciliationHistory();
  } catch (err) {
    console.error('Init treasury error:', err);
    showToast('Failed to load treasury data', 'error');
  }
}

function getSelectedScope() {
  return document.getElementById('statusScope')?.value || 'all';
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

function fmtAmount(n) {
  return (parseFloat(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toggleFinStatusDetail(index) {
  const el = document.getElementById(`finStatusDetail_${index}`);
  if (el) {
    el.classList.toggle('is-open');
    const trigger = el.closest('.data-card--expandable')?.querySelector('.data-card-expand-trigger');
    if (trigger) trigger.setAttribute('aria-expanded', el.classList.contains('is-open') ? 'true' : 'false');
  }
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
  let tableRows = '';
  let mobileCards = '';

  reportRows.forEach((row, index) => {
    if (row.closingUsd !== null) grandUsd += row.closingUsd;
    const closingClass = row.closing < 0 ? 'negative' : 'positive';
    const typeBadge = row.scopeLabel === 'Personal' ? 'warning' : 'info';

    tableRows += `
      <tr>
        <td data-label="Type"><span class="badge badge-${typeBadge}">${row.scopeLabel}</span></td>
        <td data-label="Source"><strong>${row.bucketName}</strong></td>
        <td data-label="Currency"><span class="badge badge-info">${row.currency}</span></td>
        <td data-label="Opening">${fmtAmount(row.opening)}</td>
        <td data-label="+ Income" class="positive">+${fmtAmount(row.income)}</td>
        <td data-label="+ Transfers In" class="positive">+${fmtAmount(row.transfersIn)}</td>
        <td data-label="- Expenses" class="negative">-${fmtAmount(row.expenses)}</td>
        <td data-label="- Transfers Out" class="negative">-${fmtAmount(row.transfersOut)}</td>
        <td data-label="Closing" class="${closingClass}"><strong>${fmtAmount(row.closing)}</strong></td>
        <td data-label="USD Equiv" style="color:var(--primary);">${row.closingUsd !== null ? `$${row.closingUsd.toFixed(2)}` : '—'}</td>
      </tr>
    `;

    mobileCards += `
      <article class="data-card data-card--compact data-card--expandable">
        <button type="button" class="data-card-expand-trigger" onclick="window.toggleFinStatusDetail(${index})" aria-expanded="false" aria-controls="finStatusDetail_${index}">
          <div class="data-card-top">
            <span class="data-card-title">${row.bucketName}</span>
            <span class="badge badge-${typeBadge}">${row.scopeLabel}</span>
          </div>
          ${cardRow('Closing', fmtAmount(row.closing), closingClass)}
          ${cardRow('USD Equiv', row.closingUsd !== null ? `$${row.closingUsd.toFixed(2)}` : '—')}
          <span class="data-card-expand-hint">Tap for full breakdown</span>
        </button>
        <div id="finStatusDetail_${index}" class="data-card-detail">
          ${cardRow('Currency', row.currency)}
          ${cardRow('Opening', fmtAmount(row.opening))}
          ${cardRow('+ Income', `+${fmtAmount(row.income)}`, 'positive')}
          ${cardRow('+ Transfers In', `+${fmtAmount(row.transfersIn)}`, 'positive')}
          ${cardRow('- Expenses', `-${fmtAmount(row.expenses)}`, 'negative')}
          ${cardRow('- Transfers Out', `-${fmtAmount(row.transfersOut)}`, 'negative')}
        </div>
      </article>
    `;
  });

  container.innerHTML = `
    <h3 style="margin-top:16px;">Treasury status as of ${asOfDate}</h3>
    <div class="table-container show-desktop">
      <table class="status-table table-stack-mobile">
        <thead>
          <tr>
            <th>Type</th><th>Source</th><th>Currency</th><th>Opening</th><th>+ Income</th><th>+ Transfers In</th>
            <th>- Expenses</th><th>- Transfers Out</th><th>= Closing</th><th>USD Equiv</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
          <tr class="status-total">
            <td data-label="Total USD Equivalent" colspan="9" style="text-align:right;"><strong>Total USD Equivalent:</strong></td>
            <td data-label="Amount" style="color:var(--primary);"><strong>$${grandUsd.toFixed(2)}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="show-mobile data-card-list">${mobileCards}</div>
    <article class="show-mobile data-card data-card--total">
      ${cardRow('Total USD Equivalent', `$${grandUsd.toFixed(2)}`)}
    </article>
    <div class="recon-help-box">
      <strong>Daily reconcile:</strong> Use <strong>Financials → Reconciliation → Reconcile</strong> to submit actual bucket counts.
    </div>
  `;
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
          <td data-label="Opening">${fmtAmount(line.opening_balance)}</td>
          <td data-label="+ Income" class="positive">+${fmtAmount(line.income_amount)}</td>
          <td data-label="+ Transfers In" class="positive">+${fmtAmount(line.transfers_in)}</td>
          <td data-label="- Expenses" class="negative">-${fmtAmount(line.expenses_amount)}</td>
          <td data-label="- Transfers Out" class="negative">-${fmtAmount(line.transfers_out)}</td>
          <td data-label="Closing"><strong>${fmtAmount(line.closing_balance)}</strong></td>
          <td data-label="Actual"><strong>${fmtAmount(line.actual_balance)}</strong></td>
          <td data-label="Difference" class="${diffLevel}">${diffText}</td>
          <td data-label="USD Equiv" style="color:var(--primary);">${line.usd_equivalent !== null && line.usd_equivalent !== undefined ? `$${fmtAmount(line.usd_equivalent)}` : '—'}</td>
          <td data-label="Comments">${line.comments || '—'}</td>
        </tr>
      `;

      mobileLines += `
        <article class="data-card data-card--compact data-card--expandable">
          <button type="button" class="data-card-expand-trigger" onclick="window.toggleFinStatusDetail('recon_${idx}')" aria-controls="finStatusDetail_recon_${idx}">
            <div class="data-card-top">
              <span class="data-card-title">${line.bucket_name}</span>
              <span class="badge badge-${typeBadge}">${scopeLabel}</span>
            </div>
            ${cardRow('Actual', fmtAmount(line.actual_balance))}
            ${cardRow('Difference', diffText, diffLevel)}
            <span class="data-card-expand-hint">Tap for breakdown</span>
          </button>
          <div id="finStatusDetail_recon_${idx}" class="data-card-detail">
            ${cardRow('Closing', fmtAmount(line.closing_balance))}
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
  document.querySelectorAll('#reconHistoryList tr.selected').forEach(row => row.classList.remove('selected'));
}
