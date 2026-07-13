// ==================== ONE KAILASA HOME ====================
import {
  hasAppAccess,
  getAppMeta,
  loadOkMessages,
  markOkMessageRead
} from '../utils/okAccess.js';
import { state } from '../state.js';
import { renderOkShell, initOkShell } from './ok-shell.js';
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
  return pins.map(p => p.app_code).filter(code => hasAppAccess(code));
}

function logosHtml() {
  const codes = pinnedApps();
  if (!codes.length) {
    return `<p class="empty-state">No apps on your home screen. Open Profile → Select apps.</p>`;
  }
  return `
    <div class="ok-app-grid" id="okAppGrid">
      ${codes.map(code => {
        const meta = getAppMeta(code);
        const src = appLogoSrc(code);
        const logo = src
          ? `<img src="${src}" alt="${escapeHtml(meta?.label || code)}" class="ok-app-logo-img">`
          : `<span class="ok-app-logo-fallback" aria-label="${escapeHtml(meta?.label || code)}">${escapeHtml(appInitial(code))}</span>`;
        return `
          <button type="button" class="ok-app-tile" data-ok-nav="${meta?.path || '/'}" title="${escapeHtml(meta?.label || code)}">
            ${logo}
          </button>
        `;
      }).join('')}
    </div>
  `;
}

export function getOkHomePage() {
  return renderOkShell({
    activePath: '/',
    title: 'One Kailasa',
    bottomTab: 'home',
    mainHtml: `
      <div class="card">
        <h2>Notifications</h2>
        <div id="okNotificationsList" class="ok-notif-list">
          <p class="empty-state">Loading…</p>
        </div>
      </div>

      <div class="card">
        <h2>My apps</h2>
        <div id="okAppsSection">
          ${logosHtml()}
        </div>
      </div>
    `
  });
}

export function initOkHomePage() {
  initOkShell();
  loadNotifications();
}

async function loadNotifications() {
  const el = document.getElementById('okNotificationsList');
  if (!el) return;
  const messages = await loadOkMessages(state.user?.id);
  if (!messages.length) {
    el.innerHTML = `<p class="empty-state">No notifications yet.</p>`;
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
