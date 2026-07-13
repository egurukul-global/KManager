// ==================== ONE KAILASA HOME ====================
import { state } from '../state.js';
import { getDisplayName } from '../utils/displayName.js';
import {
  OK_APPS,
  hasAppAccess,
  isOkAdmin,
  getAppMeta,
  loadOkMessages,
  markOkMessageRead,
  navigateOk,
  saveOkHomePins
} from '../utils/okAccess.js';
import { showToast } from '../components/toasts.js';
import kmofLogo from '../../KMOF.png';

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function appLogoSrc(code) {
  if (code === 'finance') return kmofLogo;
  return '';
}

function appInitial(code) {
  const meta = getAppMeta(code);
  return (meta?.label || code).slice(0, 1).toUpperCase();
}

function pinnedApps() {
  const pins = (state.okPins || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  let codes = pins.map(p => p.app_code).filter(code => hasAppAccess(code));
  if (!codes.length) {
    codes = OK_APPS.map(a => a.code).filter(code => hasAppAccess(code));
  }
  return codes;
}

function sidebarAppsHtml() {
  return OK_APPS.filter(a => hasAppAccess(a.code)).map(a => `
    <button type="button" class="ok-side-link" data-ok-nav="${a.path}">
      <span class="ok-side-label">${escapeHtml(a.label)}</span>
      ${a.live ? '' : '<span class="ok-side-soon">Soon</span>'}
    </button>
  `).join('');
}

function logosHtml() {
  const codes = pinnedApps();
  if (!codes.length) {
    return `<p class="ok-empty">No apps assigned yet. Contact a One Kailasa administrator.</p>`;
  }
  return codes.map(code => {
    const meta = getAppMeta(code);
    const src = appLogoSrc(code);
    const logo = src
      ? `<img src="${src}" alt="" class="ok-app-logo-img">`
      : `<span class="ok-app-logo-fallback">${escapeHtml(appInitial(code))}</span>`;
    return `
      <button type="button" class="ok-app-tile" data-ok-nav="${meta?.path || '/'}">
        <span class="ok-app-logo">${logo}</span>
        <span class="ok-app-name">${escapeHtml(meta?.label || code)}</span>
        ${meta?.live ? '' : '<span class="ok-app-badge">Coming soon</span>'}
      </button>
    `;
  }).join('');
}

export function getOkHomePage() {
  const displayName = getDisplayName(state.user);
  const adminLink = isOkAdmin()
    ? `<button type="button" class="ok-side-link ok-side-link--admin" data-ok-nav="/admin">Admin</button>`
    : '';

  return `
    <div class="ok-shell">
      <aside class="ok-sidebar">
        <div class="ok-brand">
          <span class="ok-brand-mark" aria-hidden="true">🔱</span>
          <div>
            <div class="ok-brand-title">One Kailasa</div>
            <div class="ok-brand-user" title="${escapeHtml(state.user?.name || '')}">${escapeHtml(displayName)}</div>
          </div>
        </div>
        <nav class="ok-side-nav" aria-label="Apps">
          ${sidebarAppsHtml()}
          ${adminLink}
        </nav>
        <div class="ok-side-footer">
          <button type="button" class="link-btn" data-ok-nav="/finance" data-ok-page="profile" id="okProfileBtn">Profile</button>
          <button type="button" class="ok-signout" onclick="window.handleLogout()">Sign Out</button>
        </div>
      </aside>

      <main class="ok-main">
        <header class="ok-main-header">
          <h1>Welcome</h1>
          <p>Choose an app below, or open one from the sidebar.</p>
        </header>

        <section class="ok-section ok-notifications" aria-label="Notifications">
          <h2>Notifications</h2>
          <div id="okNotificationsList" class="ok-notif-list">
            <p class="ok-empty">Loading…</p>
          </div>
        </section>

        <section class="ok-section" aria-label="Apps">
          <div class="ok-section-head">
            <h2>My apps</h2>
            <button type="button" class="link-btn" id="okEditPinsBtn">Choose logos</button>
          </div>
          <div class="ok-app-grid" id="okAppGrid">
            ${logosHtml()}
          </div>
        </section>

        <div id="okPinsModal" class="modal" style="display:none;">
          <div class="modal-content" style="max-width:420px;">
            <button type="button" class="close-modal" id="okPinsClose">&times;</button>
            <h2>Apps on my home screen</h2>
            <p class="page-intro">Only apps you can open are listed. Checked apps show as logos below notifications.</p>
            <div id="okPinsChecks"></div>
            <div class="btn-group" style="margin-top:16px;">
              <button type="button" id="okPinsSave">Save</button>
              <button type="button" class="secondary" id="okPinsCancel">Cancel</button>
            </div>
          </div>
        </div>
      </main>
    </div>
  `;
}

export function initOkHomePage() {
  document.querySelectorAll('[data-ok-nav]').forEach(btn => {
    btn.addEventListener('click', () => {
      const path = btn.getAttribute('data-ok-nav');
      if (path) navigateOk(path);
    });
  });

  const profileBtn = document.getElementById('okProfileBtn');
  if (profileBtn) {
    profileBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (!hasAppAccess('finance')) return;
      navigateOk('/finance');
      // Finance shell will land on default; profile via hash hint
      sessionStorage.setItem('ok_open_page', 'profile');
    });
  }

  loadNotifications();
  setupPinsModal();
}

async function loadNotifications() {
  const el = document.getElementById('okNotificationsList');
  if (!el) return;
  const messages = await loadOkMessages(state.user?.id);
  if (!messages.length) {
    el.innerHTML = `<p class="ok-empty">No notifications yet.</p>`;
    return;
  }
  el.innerHTML = messages.map(m => {
    const unread = !m.read_at;
    return `
      <button type="button" class="ok-notif ${unread ? 'ok-notif--unread' : ''}" data-msg-id="${m.id}">
        <strong>${escapeHtml(m.title)}</strong>
        <span>${escapeHtml(m.body)}</span>
        <time>${escapeHtml(new Date(m.created_at).toLocaleString())}</time>
      </button>
    `;
  }).join('');

  el.querySelectorAll('[data-msg-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-msg-id');
      await markOkMessageRead(id);
      btn.classList.remove('ok-notif--unread');
    });
  });
}

function setupPinsModal() {
  const modal = document.getElementById('okPinsModal');
  const openBtn = document.getElementById('okEditPinsBtn');
  const closeBtn = document.getElementById('okPinsClose');
  const cancelBtn = document.getElementById('okPinsCancel');
  const saveBtn = document.getElementById('okPinsSave');
  const checks = document.getElementById('okPinsChecks');
  if (!modal || !openBtn || !checks) return;

  const close = () => { modal.style.display = 'none'; };

  openBtn.addEventListener('click', () => {
    const pinned = new Set((state.okPins || []).map(p => p.app_code));
    const allowed = OK_APPS.filter(a => hasAppAccess(a.code));
    checks.innerHTML = allowed.map(a => `
      <label class="ok-pin-check">
        <input type="checkbox" value="${a.code}" ${pinned.has(a.code) || (!pinned.size && a.code === 'finance') ? 'checked' : ''}>
        ${escapeHtml(a.label)}
      </label>
    `).join('') || '<p class="ok-empty">No apps assigned.</p>';
    modal.style.display = 'flex';
  });

  closeBtn?.addEventListener('click', close);
  cancelBtn?.addEventListener('click', close);

  saveBtn?.addEventListener('click', async () => {
    const selected = [...checks.querySelectorAll('input:checked')].map(i => i.value);
    try {
      await saveOkHomePins(state.user.id, selected);
      const grid = document.getElementById('okAppGrid');
      if (grid) grid.innerHTML = logosHtml();
      document.querySelectorAll('#okAppGrid [data-ok-nav]').forEach(btn => {
        btn.addEventListener('click', () => navigateOk(btn.getAttribute('data-ok-nav')));
      });
      close();
    } catch (err) {
      showToast(err.message || 'Could not save', 'error');
    }
  });
}
