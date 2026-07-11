// ==================== MY INCOME (scoped — received money only) ====================
import { state } from '../state.js';
import { supabaseClient } from '../db.js';
import { formatUsdDisplay } from '../utils/currency.js';
import { findPersonalTeamForUser } from '../utils/personalTeamHelpers.js';
import { fetchReceivedTransfersForUser } from '../utils/transferActions.js';

function formatUsd(amount) {
  return '$' + formatUsdDisplay(amount);
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

export function getMyIncomePage() {
  return `
    <h1 class="page-title">My Income</h1>
    <p class="page-intro">Money you received — personal income and accepted transfers. Team Income Manager is separate.</p>

    <div class="stats-grid dash-stats">
      <div class="stat-card stat-card--income">
        <h3 id="miTotal">—</h3>
        <p>Total received (USD)</p>
      </div>
    </div>

    <div class="card">
      <h2>📥 Received</h2>
      <div id="miList"><p class="dash-alerts-loading">Loading…</p></div>
    </div>
  `;
}

export async function initMyIncomePage() {
  const userId = state.user?.id;
  if (!userId) return;

  try {
    const personalTeam = await findPersonalTeamForUser(userId);
    const teamIds = new Set(state.teams.map(t => t.team_id));
    if (personalTeam?.id) teamIds.add(personalTeam.id);

    const teamIdList = [...teamIds];

    const [incomeRes, transfers, bucketsRes] = await Promise.all([
      teamIdList.length
        ? supabaseClient.from('income').select('*').in('team_id', teamIdList).eq('is_deleted', false).order('date', { ascending: false })
        : Promise.resolve({ data: [] }),
      fetchReceivedTransfersForUser(userId),
      teamIdList.length
        ? supabaseClient.from('buckets').select('id, name, team_id, owner_user_id').in('team_id', teamIdList).eq('is_deleted', false)
        : Promise.resolve({ data: [] })
    ]);

    const buckets = bucketsRes.data || [];
    const myBucketIds = new Set(
      buckets.filter(b => b.owner_user_id === userId || (personalTeam && b.team_id === personalTeam.id))
        .map(b => b.id)
    );

    const incomeRows = (incomeRes.data || []).filter(rec => {
      if (!myBucketIds.has(rec.bucket_id)) return false;
      if (rec.created_by && rec.created_by !== userId && rec.balance_impact === false) {
        return rec.linked_transfer_id != null;
      }
      return true;
    });

    const rows = [];

    incomeRows.forEach(rec => {
      rows.push({
        date: rec.date,
        source: rec.payment_from || 'Income',
        amount: parseFloat(rec.amount_usd) || 0,
        memo: rec.description || '',
        kind: rec.balance_impact === false ? 'Transfer (linked)' : 'Income'
      });
    });

    transfers.forEach(t => {
      const alreadyLinked = incomeRows.some(i => i.linked_transfer_id === t.id);
      if (alreadyLinked) return;
      rows.push({
        date: t.date,
        source: 'Transfer received',
        amount: parseFloat(t.dest_amount) || parseFloat(t.amount) || 0,
        memo: t.description || '',
        kind: 'Transfer'
      });
    });

    rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    const total = rows.reduce((sum, r) => sum + (r.amount || 0), 0);
    const totalEl = document.getElementById('miTotal');
    if (totalEl) totalEl.textContent = formatUsd(total);

    const listEl = document.getElementById('miList');
    if (!listEl) return;

    if (!rows.length) {
      listEl.innerHTML = '<p class="empty-state">No received income yet.</p>';
      return;
    }

    listEl.innerHTML = `
      <div class="table-container">
        <table class="table-stack-mobile">
          <thead><tr><th>Date</th><th>Source</th><th>Amount (USD)</th><th>Memo</th><th>Type</th></tr></thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td data-label="Date">${escapeHtml(r.date)}</td>
                <td data-label="Source">${escapeHtml(r.source)}</td>
                <td data-label="Amount">${formatUsd(r.amount)}</td>
                <td data-label="Memo">${escapeHtml(r.memo)}</td>
                <td data-label="Type">${escapeHtml(r.kind)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    console.error('My Income load error:', err);
    const listEl = document.getElementById('miList');
    if (listEl) listEl.innerHTML = `<p class="empty-state" style="color:#dc3545;">${escapeHtml(err.message)}</p>`;
  }
}
