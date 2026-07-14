// ==================== ONE KAILASA HOME ====================
import {
  hasAppAccess,
  getAppMeta,
  loadOkMessages,
  markOkMessageRead,
  markAllOkMessagesRead,
  getNotificationMode,
  summarizeOkMessages,
  navigateOk
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

function openApprovals(page, actionId, teamId) {
  sessionStorage.setItem('ok_open_page', page || 'approval-portal');
  if (actionId) sessionStorage.setItem('ok_open_request_id', actionId);
  else sessionStorage.removeItem('ok_open_request_id');
  if (teamId) sessionStorage.setItem('ok_open_team_id', teamId);
  else sessionStorage.removeItem('ok_open_team_id');

  if (parseAppPathSafe() !== 'finance') {
    navigateOk('/finance');
    return;
  }
  if (typeof window.showPage === 'function') {
    window.showPage(page || 'approval-portal');
  }
}

function parseAppPathSafe() {
  const raw = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
  const lower = raw.toLowerCase();
  if (lower === '/finance' || lower.startsWith('/finance/')) return 'finance';
  return 'other';
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
  const mode = getNotificationMode();

  if (!messages.length) {
    el.innerHTML = `<p class="empty-state">No notifications yet.</p>`;
    return;
  }

  if (mode === 'summary') {
    const lines = summarizeOkMessages(messages);
    if (!lines.length) {
      el.innerHTML = `<p class="empty-state">No new notifications.</p>`;
      return;
    }
    el.innerHTML = `
      <button type="button" class="ok-notif ok-notif--summary ok-notif--unread" data-summary="1">
        <span class="ok-notif-line">${escapeHtml(lines.map(l => l.text).join('. ') + '.')}</span>
      </button>
    `;
    el.querySelector('[data-summary]')?.addEventListener('click', async () => {
      await markAllOkMessagesRead(state.user?.id);
      openApprovals('approval-portal', '', '');
    });
    return;
  }

  // Detail: one compact line per message
  el.innerHTML = messages.map(m => {
    const unread = !m.read_at;
    const line = (m.title || m.body || 'Notification').trim();
    return `
      <button type="button" class="ok-notif ok-notif--line ${unread ? 'ok-notif--unread' : ''}" data-msg-id="${m.id}" data-action-page="${escapeHtml(m.action_page || '')}" data-action-id="${escapeHtml(m.action_id || '')}" data-team-id="${escapeHtml(m.team_id || '')}">
        <span class="ok-notif-line">${escapeHtml(line)}</span>
      </button>
    `;
  }).join('');

  el.querySelectorAll('[data-msg-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-msg-id');
      const page = btn.getAttribute('data-action-page') || 'approval-portal';
      const actionId = btn.getAttribute('data-action-id') || '';
      const teamId = btn.getAttribute('data-team-id') || '';
      await markOkMessageRead(id);
      btn.classList.remove('ok-notif--unread');
      openApprovals(page, actionId, teamId);
    });
  });
}
