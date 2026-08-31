// ==================== USER PROFILE ====================
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
      <h2>Dashboard Settings</h2>
      <p class="page-intro">Configure how your dashboard totals are calculated based on your custom Budget Calendar.</p>
      <div class="form-stack">
        <div class="form-group">
          <label>Expenses Timeline</label>
          <select id="profileDashTimeline" onchange="window.toggleDashTimelineDate()">
            <option value="all">All Time</option>
            <option value="current_period">Current Budget Period</option>
            <option value="specific_period">Specific Budget Period...</option>
          </select>
        </div>
        <div class="form-group" id="profileDashPeriodGroup" style="display:none;">
          <label>Select Period</label>
          <select id="profileDashSpecificPeriod">
            <option value="">Loading periods...</option>
          </select>
        </div>
        <button type="button" class="btn" onclick="window.saveDashboardSettings()">Save Dashboard Settings</button>
      </div>
    </div>

    <div class="card">
      <h2>View Settings</h2>
      <p class="page-intro">Configure your default view and context.</p>
      <form id="profileViewSettingsForm" onsubmit="window.saveProfileViewSettings(event)">
        <div class="form-stack">
          <div class="form-group" id="profileViewModeContainer">
            <label for="profileDefaultView">Default Login View</label>
            <select id="profileDefaultView">
              <!-- Rendered via initProfilePage based on role -->
            </select>
          </div>
          <div class="form-group">
            <label for="profileDefaultTeam">Default Team</label>
            <select id="profileDefaultTeam">
              ${state.teams.map(t => `<option value="${t.team_id}" ${t.is_primary ? 'selected' : ''}>${escapeHtml(t.team_name)}</option>`).join('')}
            </select>
          </div>
        </div>
        <button type="submit" class="btn-block">Save Settings</button>
      </form>
    </div>

    <div class="card">
      <h2>Request alias</h2>
      <p class="page-intro">3-5 characters, unique. Used for approval request numbers like <strong>TTM-42</strong>.</p>
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
  window.saveProfileViewSettings = saveProfileViewSettings;

  // Populate Default Login View
  const viewSelect = document.getElementById('profileDefaultView');
  if (viewSelect) {
    const allowed = state.user?.allowed_views || ['team'];
    const isAdmin = allowed.includes('admin');
    const isManager = allowed.includes('manager');
    
    viewSelect.innerHTML = '<option value="team">Team View</option>';
    if (isManager) {
      viewSelect.innerHTML += '<option value="manager">Manager View (Finance)</option>';
    }
    if (isAdmin) {
      viewSelect.innerHTML += '<option value="admin">Admin View (Configuration)</option>';
    }
    
    viewSelect.value = state.user?.default_login_view || 'team';
  }

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

async function saveProfileViewSettings(e) {
  e.preventDefault();
  const defaultTeam = document.getElementById('profileDefaultTeam')?.value;
  const defaultView = document.getElementById('profileDefaultView')?.value || 'team';
  
  try {
    // 1. Save default team
    if (defaultTeam) {
      for (const t of state.teams) {
        if (t.is_primary && t.team_id !== defaultTeam) {
          await supabaseClient.from('user_teams').update({ is_primary: false }).eq('user_id', state.user.id).eq('team_id', t.team_id);
          t.is_primary = false;
        }
      }
      const newPrim = state.teams.find(t => t.team_id === defaultTeam);
      if (newPrim && !newPrim.is_primary) {
        await supabaseClient.from('user_teams').update({ is_primary: true }).eq('user_id', state.user.id).eq('team_id', defaultTeam);
        newPrim.is_primary = true;
      }
    }
    
    // 2. Save default view
    if (state.user) {
      await supabaseClient.from('users').update({ default_login_view: defaultView }).eq('id', state.user.id);
      state.user.default_login_view = defaultView;
    }
    
    showToast('View settings saved!', 'success');
  } catch (err) {
    console.error(err);
    showToast('Failed to save settings', 'error');
  }
}
