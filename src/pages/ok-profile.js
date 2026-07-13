// ==================== ONE KAILASA PROFILE ====================
import { state } from '../state.js';
import {
  OK_APPS,
  hasAppAccess,
  saveOkHomePins
} from '../utils/okAccess.js';
import { showToast } from '../components/toasts.js';
import { renderOkShell, initOkShell } from './ok-shell.js';

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

export function getOkProfilePage() {
  const pinned = new Set((state.okPins || []).map(p => p.app_code));
  const allowed = OK_APPS.filter(a => hasAppAccess(a.code));
  const checks = allowed.length
    ? allowed.map(a => `
        <label class="ok-pin-check">
          <input type="checkbox" name="okSelectApp" value="${a.code}" ${pinned.has(a.code) ? 'checked' : ''}>
          ${escapeHtml(a.label)}${a.live ? '' : ' (soon)'}
        </label>
      `).join('')
    : '<p class="empty-state">No apps assigned. Contact a One Kailasa administrator.</p>';

  return renderOkShell({
    activePath: '/profile',
    title: 'Profile',
    bottomTab: 'profile',
    mainHtml: `
      <h1 class="page-title">Profile</h1>

      <div class="card">
        <h2>Account</h2>
        <div class="data-card-list">
          <article class="data-card data-card--compact">
            <div class="data-card-row"><span class="data-card-row-label">Name</span><span class="data-card-row-value">${escapeHtml(state.user?.name || '—')}</span></div>
            <div class="data-card-row"><span class="data-card-row-label">Email</span><span class="data-card-row-value">${escapeHtml(state.user?.email || '—')}</span></div>
          </article>
        </div>
      </div>

      <div class="card">
        <h2>Select apps</h2>
        <p class="page-intro">Checked apps appear as logos on your One Kailasa home screen.</p>
        <div id="okProfileAppChecks" class="ok-access-checks">${checks}</div>
        <div class="btn-group" style="margin-top:16px;">
          <button type="button" id="okProfileSaveApps">Save</button>
        </div>
      </div>
    `
  });
}

export function initOkProfilePage() {
  initOkShell();

  document.getElementById('okProfileSaveApps')?.addEventListener('click', async () => {
    const selected = [...document.querySelectorAll('input[name="okSelectApp"]:checked')].map(i => i.value);
    try {
      await saveOkHomePins(state.user.id, selected);
      showToast('Apps saved', 'success');
    } catch (err) {
      showToast(err.message || 'Could not save', 'error');
    }
  });
}
