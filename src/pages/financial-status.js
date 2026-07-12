// ==================== TREASURY (bucket balance reports) ====================
import { state } from '../state.js';
import { sbSelect } from '../db.js';
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
    <p class="page-intro">Bucket balances for <strong>${teamName}</strong>. Submit daily reconciliations from <strong>Financials → Reconciliation → Reconcile</strong>.</p>

    <div class="card">
      <h2>Treasury Report</h2>
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
  `;
}

export async function initFinancialStatusPage() {
  window.generateFinancialStatus = generateFinancialStatus;
  window.resetFinancialStatus = resetFinancialStatus;
  window.onStatusScopeChange = onStatusScopeChange;
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
