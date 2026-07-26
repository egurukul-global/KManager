// ==================== ONE KAILASA PROFILE ====================
import { state } from '../state.js';
import {
  OK_APPS,
  hasAppAccess,
  saveOkHomePins,
  saveNotificationMode
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

  const notifMode = state.user?.notification_mode === 'detail' ? 'detail' : 'summary';

      const isDark = document.body.classList.contains('dark');

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
            <h2>Theme</h2>
            <p class="page-intro">Switch between light and dark modes.</p>
            <button type="button" onclick="window.toggleTheme()" class="card-hover" style="display: flex; align-items: center; gap: 10px; padding: 10px 20px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-secondary); color: var(--text); cursor: pointer; font-size: 0.9rem; font-weight: 500; text-align: left; width: fit-content; min-height: 40px;">
              <i class="fas fa-moon" id="themeMoonIcon" style="display: ${isDark ? 'none' : 'inline-block'}; text-align: center; width: 16px;"></i>
              <i class="fas fa-sun text-amber-400" id="themeSunIcon" style="display: ${isDark ? 'inline-block' : 'none'}; text-align: center; width: 16px;"></i>
              <span id="themeToggleLabel">${isDark ? 'Light Mode' : 'Dark Mode'}</span>
            </button>
          </div>

      <div class="card">
        <h2>Notifications</h2>
        <p class="page-intro">Choose how approvals appear on your home screen.</p>
        <div class="ok-access-checks" id="okNotifModeGroup">
          <label class="ok-pin-check">
            <input type="radio" name="okNotifMode" value="summary" ${notifMode === 'summary' ? 'checked' : ''}>
            Summary — e.g. “You have 10 budget approvals”
          </label>
          <label class="ok-pin-check">
            <input type="radio" name="okNotifMode" value="detail" ${notifMode === 'detail' ? 'checked' : ''}>
            Detail — one line per request
          </label>
        </div>
        <div class="btn-group" style="margin-top:16px;">
          <button type="button" id="okProfileSaveNotif">Save notification style</button>
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

  document.getElementById('okProfileSaveNotif')?.addEventListener('click', async () => {
    const mode = document.querySelector('input[name="okNotifMode"]:checked')?.value || 'summary';
    try {
      await saveNotificationMode(state.user.id, mode);
      showToast('Notification style saved', 'success');
    } catch (err) {
      showToast(err.message || 'Could not save', 'error');
    }
  });
}
