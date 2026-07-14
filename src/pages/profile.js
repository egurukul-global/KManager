// ==================== USER PROFILE (Phase 4A — request alias) ====================
import { state } from '../state.js';
import { showToast } from '../components/toasts.js';
import { validateRequestAlias, formatRequestNumber, saveUserRequestAlias } from '../utils/requestNumbers.js';
import { orgRoleLabel, teamAccessLabel } from '../utils/roleLabels.js';
import { supabaseClient } from '../db.js';
import { refreshAccessibleTeams } from '../utils/teamAccess.js';

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

export function getProfilePage() {
  const alias = state.user?.request_alias || '';
  const counter = state.user?.request_counter ?? 0;
  const nextPreview = alias ? formatRequestNumber(alias, counter + 1) : 'Set alias first';

  return `
    <h1 class="page-title">My Profile</h1>

    <div class="card">
      <h2>Account</h2>
      <div class="data-card-list">
        <article class="data-card data-card--compact">
          <div class="data-card-row"><span class="data-card-row-label">Name</span><span class="data-card-row-value">${state.user?.name || '—'}</span></div>
          <div class="data-card-row"><span class="data-card-row-label">Email</span><span class="data-card-row-value">${state.user?.email || '—'}</span></div>
          <div class="data-card-row"><span class="data-card-row-label">Org role</span><span class="data-card-row-value">${orgRoleLabel(state.user?.role)}</span></div>
          <div class="data-card-row"><span class="data-card-row-label">Team access</span><span class="data-card-row-value">${teamAccessLabel(state.userTeamAccess?.access_level)}</span></div>
        </article>
      </div>
    </div>

    <div class="card">
      <h2>Default team</h2>
      <p class="page-intro">Select the team that opens by default when you access the app.</p>
      <form id="profileDefaultTeamForm" onsubmit="window.saveProfileDefaultTeam(event)">
        <div class="form-group">
          <label for="profileDefaultTeam">Default team</label>
          <select id="profileDefaultTeam">
            ${state.teams.map(t => `
              <option value="${t.team_id}" ${t.is_primary ? 'selected' : ''}>
                ${escapeHtml(t.team_name)}
              </option>
            `).join('')}
          </select>
        </div>
        <div class="btn-group">
          <button type="submit">Save default team</button>
        </div>
      </form>
    </div>

    <div class="card">
      <h2>Request alias</h2>
      <p class="page-intro">3–5 characters, unique. Used for approval request numbers like <strong>TTM-42</strong>.</p>
      <form id="profileAliasForm" onsubmit="window.saveProfileAlias(event)">
        <div class="form-group">
          <label for="profileAlias">Alias</label>
          <input type="text" id="profileAlias" maxlength="5" minlength="3" pattern="[A-Za-z0-9]{3,5}"
            value="${alias}" placeholder="e.g. TTM" required style="text-transform:uppercase;">
        </div>
        <p class="form-hint">Next request number: <strong id="profileNextNumber">${nextPreview}</strong></p>
        <div class="btn-group">
          <button type="submit">Save alias</button>
        </div>
      </form>
    </div>
  `;
}

export function initProfilePage() {
  window.saveProfileAlias = saveProfileAlias;
  window.saveProfileDefaultTeam = saveProfileDefaultTeam;

  const input = document.getElementById('profileAlias');
  const preview = document.getElementById('profileNextNumber');
  if (input && preview) {
    input.addEventListener('input', () => {
      const check = validateRequestAlias(input.value);
      const counter = state.user?.request_counter ?? 0;
      preview.textContent = check.ok ? formatRequestNumber(check.value, counter + 1) : '—';
    });
  }
}

async function saveProfileAlias(e) {
  e.preventDefault();
  const input = document.getElementById('profileAlias');
  const alias = input?.value?.trim();
  if (!alias || !state.user?.id) return;

  try {
    const saved = await saveUserRequestAlias(state.user.id, alias);
    state.user.request_alias = saved;
    showToast(`Alias saved: ${saved}`, 'success');
    const preview = document.getElementById('profileNextNumber');
    if (preview) {
      preview.textContent = formatRequestNumber(saved, (state.user.request_counter ?? 0) + 1);
    }
  } catch (err) {
    showToast(err.message || 'Failed to save alias', 'error');
  }
}

async function saveProfileDefaultTeam(e) {
  e.preventDefault();
  const select = document.getElementById('profileDefaultTeam');
  const teamId = select?.value;
  if (!teamId || !state.user?.id) return;

  try {
    await supabaseClient
      .from('user_teams')
      .update({ is_primary: false })
      .eq('user_id', state.user.id);

    const { error } = await supabaseClient
      .from('user_teams')
      .update({ is_primary: true })
      .eq('user_id', state.user.id)
      .eq('team_id', teamId);

    if (error) throw error;

    showToast('Default team updated', 'success');
    await refreshAccessibleTeams();
  } catch (err) {
    showToast(err.message || 'Failed to save default team', 'error');
  }
}
