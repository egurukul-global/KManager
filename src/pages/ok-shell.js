// ==================== ONE KAILASA SHELL (same patterns as Finance) ====================
import { state } from '../state.js';
import { getDisplayName } from '../utils/displayName.js';
import {
  OK_APPS,
  hasAppAccess,
  isOkAdmin,
  navigateOk
} from '../utils/okAccess.js';
import swamijiImg from '../Swamiji.png';

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function toggleOkSidebar() {
  document.getElementById('sidebar')?.classList.toggle('active');
  document.querySelector('.overlay')?.classList.toggle('active');
}

function closeOkSidebar() {
  document.getElementById('sidebar')?.classList.remove('active');
  document.querySelector('.overlay')?.classList.remove('active');
}

/**
 * Finance-style shell: mobile-header, overlay, sidebar, topbar, main-content, bottom-nav.
 * @param {object} opts
 * @param {string} opts.activePath - '/', '/profile', '/admin', '/finance', etc.
 * @param {string} opts.title - mobile header + topbar title
 * @param {string} opts.mainHtml - page body
 * @param {string} [opts.bottomTab] - 'home' | 'profile' | 'admin' | 'more'
 */
export function renderOkShell({ activePath, title, mainHtml, bottomTab = 'home' }) {
  const displayName = getDisplayName(state.user);
  const adminVisible = isOkAdmin();

  const appLinks = OK_APPS.filter(a => hasAppAccess(a.code)).map(a => {
    const active = activePath === a.path ? ' active' : '';
    const soon = a.live ? '' : ' <span class="nav-soon">Soon</span>';
    return `<div class="nav-subitem${active}" data-ok-nav="${a.path}">${escapeHtml(a.label)}${soon}</div>`;
  }).join('');

  const adminLink = adminVisible
    ? `<div class="nav-subitem${activePath === '/admin' ? ' active' : ''}" data-ok-nav="/admin">Admin</div>`
    : '';

  const homeActive = activePath === '/' ? ' active' : '';
  const profileActive = activePath === '/profile' ? ' active' : '';

  return `
    <div class="mobile-header">
      <button type="button" class="menu-toggle" id="okMenuToggle">☰</button>
      <h1>${escapeHtml(title)}</h1>
      <img src="${swamijiImg}" alt="" class="header-logo" width="36" height="36">
    </div>

    <div class="overlay" id="okOverlay"></div>

    <div class="app-shell active">
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-user">
          <div class="sidebar-user-text">
            <span class="sidebar-app-title">One Kailasa</span>
            <span id="userDisplayName" class="sidebar-display-name" title="${escapeHtml(state.user?.name || '')}">${escapeHtml(displayName)}</span>
          </div>
        </div>

        <nav class="nav-menu">
          <div class="nav-item expanded" data-section="apps">
            <div class="nav-item-header" id="okNavAppsHeader">
              <span class="icon">🔱</span>
              <span>Apps</span>
              <span class="arrow">▶</span>
            </div>
            <div class="nav-subitems">
              <div class="nav-subitem${homeActive}" data-ok-nav="/">Home</div>
              ${appLinks}
            </div>
          </div>

          <div class="nav-item expanded" data-section="account">
            <div class="nav-item-header" id="okNavAccountHeader">
              <span class="icon">👤</span>
              <span>Account</span>
              <span class="arrow">▶</span>
            </div>
            <div class="nav-subitems">
              ${adminLink}
              <div class="nav-subitem${profileActive}" data-ok-nav="/profile">Profile</div>
            </div>
          </div>
        </nav>

        <div class="sidebar-footer">
          <button type="button" class="sidebar-signout" onclick="window.handleLogout()">Sign Out</button>
        </div>
      </aside>

      <div class="main-area">
        <header class="app-topbar">
          <span class="app-topbar-title">${escapeHtml(title)}</span>
          <img src="${swamijiImg}" alt="" class="app-topbar-logo" width="40" height="40">
        </header>
        <main class="main-content" id="mainContent">
          ${mainHtml}
        </main>
      </div>
    </div>

    <div class="toast-container" id="toastContainer"></div>

    <nav class="bottom-nav" aria-label="Main navigation">
      <button type="button" class="bottom-nav-item${bottomTab === 'home' ? ' active' : ''}" data-ok-nav="/" data-tab="home">
        <span class="bottom-nav-icon">🏠</span>
        <span class="bottom-nav-label">Home</span>
      </button>
      <button type="button" class="bottom-nav-item${bottomTab === 'profile' ? ' active' : ''}" data-ok-nav="/profile" data-tab="profile">
        <span class="bottom-nav-icon">👤</span>
        <span class="bottom-nav-label">Profile</span>
      </button>
      ${adminVisible ? `
      <button type="button" class="bottom-nav-item${bottomTab === 'admin' ? ' active' : ''}" data-ok-nav="/admin" data-tab="admin">
        <span class="bottom-nav-icon">⚙️</span>
        <span class="bottom-nav-label">Admin</span>
      </button>` : ''}
      <button type="button" class="bottom-nav-item${bottomTab === 'more' ? ' active' : ''}" id="okBottomMore" data-tab="more">
        <span class="bottom-nav-icon">☰</span>
        <span class="bottom-nav-label">Menu</span>
      </button>
    </nav>
  `;
}

export function initOkShell() {
  window.toggleSidebar = toggleOkSidebar;
  window.handleLogout = window.handleLogout;

  document.getElementById('okMenuToggle')?.addEventListener('click', toggleOkSidebar);
  document.getElementById('okOverlay')?.addEventListener('click', toggleOkSidebar);
  document.getElementById('okBottomMore')?.addEventListener('click', () => {
    toggleOkSidebar();
    document.querySelectorAll('.bottom-nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === 'more');
    });
  });

  document.getElementById('okNavAppsHeader')?.addEventListener('click', (e) => {
    e.currentTarget.parentElement.classList.toggle('expanded');
  });
  document.getElementById('okNavAccountHeader')?.addEventListener('click', (e) => {
    e.currentTarget.parentElement.classList.toggle('expanded');
  });

  document.querySelectorAll('[data-ok-nav]').forEach(el => {
    el.addEventListener('click', () => {
      const path = el.getAttribute('data-ok-nav');
      if (!path) return;
      closeOkSidebar();
      navigateOk(path);
    });
  });
}
