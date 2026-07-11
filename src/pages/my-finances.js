// ==================== MY FINANCES (cross-team personal view) ====================
import { state } from '../state.js';
import { supabaseClient } from '../db.js';
import { sumBucketBalancesToUsd, formatUsdDisplay, convertToUsd } from '../utils/currency.js';
import { findPersonalTeamForUser } from '../utils/personalTeamHelpers.js';
import { TRANSFER_STATUS, PENDING_STEP } from '../utils/transferConstants.js';
import { getTransferStatusBadge } from '../utils/transferHelpers.js';

function formatUsd(amount) {
  return '$' + formatUsdDisplay(amount);
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

export function getMyFinancesPage() {
  return `
    <h1 class="page-title">My Finances</h1>
    <p class="page-intro">Your personal wallets across all teams — named personal teams and work-team member buckets.</p>

    <div class="stats-grid dash-stats">
      <div class="stat-card stat-card--info">
        <h3 id="mfTotalBalance">—</h3>
        <p id="mfBalanceLabel">Total balance (USD equiv.)</p>
      </div>
      <div class="stat-card stat-card--gold">
        <h3 id="mfPendingCount">—</h3>
        <p>Pending transfers</p>
      </div>
    </div>

    <div class="card">
      <h2>💰 My Wallets</h2>
      <div id="mfBucketsList"><p class="dash-alerts-loading">Loading…</p></div>
    </div>

    <div class="card">
      <h2>💸 Pending Transfers</h2>
      <div id="mfPendingList"><p class="dash-alerts-loading">Loading…</p></div>
    </div>
  `;
}

export async function initMyFinancesPage() {
  const userId = state.user?.id;
  if (!userId) return;

  try {
    const teamIds = state.teams.map(t => t.team_id);

    const [bucketsRes, ratesResults, sentRes, recvRes] = await Promise.all([
      teamIds.length
        ? supabaseClient.from('buckets').select('*').in('team_id', teamIds).eq('is_deleted', false)
        : Promise.resolve({ data: [] }),
      Promise.all(teamIds.map(tid =>
        supabaseClient.from('exchange_rates').select('*').eq('team_id', tid).eq('is_deleted', false)
      )),
      supabaseClient.from('transfers').select('*').eq('created_by', userId).eq('status', TRANSFER_STATUS.PENDING).eq('is_deleted', false),
      supabaseClient.from('transfers').select('*').eq('receiver_user_id', userId).eq('status', TRANSFER_STATUS.PENDING).eq('is_deleted', false)
    ]);

    const allBuckets = bucketsRes.data || [];
    const rates = (ratesResults || []).flatMap(r => r.data || []);

    const personalBuckets = allBuckets.filter(b => b.owner_user_id === userId);

    const personalTeam = await findPersonalTeamForUser(userId);
    const namedBuckets = personalTeam
      ? allBuckets.filter(b => b.team_id === personalTeam.id && !b.owner_user_id)
      : [];

    const myBuckets = [...namedBuckets, ...personalBuckets];
    const teamNameById = Object.fromEntries(state.teams.map(t => [t.team_id, t.team_name]));

    const { totalUsd, breakdown, missingRates } = sumBucketBalancesToUsd(myBuckets, rates);

    const totalEl = document.getElementById('mfTotalBalance');
    const labelEl = document.getElementById('mfBalanceLabel');
    if (totalEl) totalEl.textContent = formatUsd(totalUsd);
    if (labelEl) {
      labelEl.textContent = missingRates.length
        ? `Total (USD equiv.) — no rate for: ${missingRates.join(', ')}`
        : 'Total balance (USD equiv.)';
    }

    const bucketsEl = document.getElementById('mfBucketsList');
    if (bucketsEl) {
      if (!myBuckets.length) {
        bucketsEl.innerHTML = '<p class="empty-state">No personal wallets yet.</p>';
      } else {
        bucketsEl.innerHTML = `
          <div class="table-container">
            <table class="table-stack-mobile">
              <thead><tr><th>Team</th><th>Bucket</th><th>Balance</th><th>USD equiv.</th></tr></thead>
              <tbody>
                ${myBuckets.map(b => {
                  const usd = convertToUsd(b.balance, b.currency, rates);
                  const usdText = usd !== null ? formatUsd(usd) : '—';
                  const teamLabel = teamNameById[b.team_id] || '—';
                  const kind = namedBuckets.some(n => n.id === b.id) ? 'Personal team' : 'Work member';
                  return `<tr>
                    <td data-label="Team">${escapeHtml(teamLabel)}<br><small>${kind}</small></td>
                    <td data-label="Bucket">${escapeHtml(b.name)} (${escapeHtml(b.currency || 'USD')})</td>
                    <td data-label="Balance">${(parseFloat(b.balance) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td data-label="USD">${escapeHtml(usdText)}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        `;
      }
    }

    const sent = sentRes.data || [];
    const recv = recvRes.data || [];
    const pendingMap = new Map();
    [...sent, ...recv].forEach(t => pendingMap.set(t.id, t));
    const pending = [...pendingMap.values()].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

    const pendingCountEl = document.getElementById('mfPendingCount');
    if (pendingCountEl) pendingCountEl.textContent = String(pending.length);

    const pendingEl = document.getElementById('mfPendingList');
    if (pendingEl) {
      if (!pending.length) {
        pendingEl.innerHTML = '<p class="empty-state">No pending transfers.</p>';
      } else {
        pendingEl.innerHTML = `
          <div class="table-container">
            <table class="table-stack-mobile">
              <thead><tr><th>Date</th><th>Direction</th><th>Amount</th><th>Memo</th><th>Status</th></tr></thead>
              <tbody>
                ${pending.map(t => {
                  const dir = t.created_by === userId ? 'Sent' : 'Received';
                  const step = t.pending_step === PENDING_STEP.OHF ? ' · Awaiting OHF' : t.pending_step === PENDING_STEP.RECEIVER ? ' · Awaiting you' : '';
                  const badge = getTransferStatusBadge(t.status);
                  return `<tr>
                    <td data-label="Date">${escapeHtml(t.date)}</td>
                    <td data-label="Direction">${dir}${step}</td>
                    <td data-label="Amount">${parseFloat(t.amount).toFixed(2)} ${escapeHtml(t.currency || '')}</td>
                    <td data-label="Memo">${escapeHtml(t.description || '')}</td>
                    <td data-label="Status"><span class="badge ${badge.class}">${badge.label}</span></td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
          <p class="form-hint" style="margin-top:10px;">Confirm received transfers on the Dashboard.</p>
        `;
      }
    }
  } catch (err) {
    console.error('My Finances load error:', err);
    const bucketsEl = document.getElementById('mfBucketsList');
    if (bucketsEl) bucketsEl.innerHTML = `<p class="empty-state" style="color:#dc3545;">${escapeHtml(err.message)}</p>`;
  }
}
