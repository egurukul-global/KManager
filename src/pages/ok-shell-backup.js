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
function getAppIcon(code) {
  if (code === 'finance') return 'fa-solid fa-sack-dollar';
  if (code === 'tasks') return 'fa-solid fa-list-check';
  if (code === 'konnect') return 'fa-solid fa-comments';
  if (code === 'gurukul') return 'fa-solid fa-school';
  if (code === 'utilities') return 'fa-solid fa-wrench';
  return 'fa-solid fa-cubes';
}

export function renderOkShell({ activePath, title, mainHtml, bottomTab = 'home' }) {
  const displayName = getDisplayName(state.user);
  const adminVisible = isOkAdmin();

  const appLinks = OK_APPS.filter(a => hasAppAccess(a.code)).map(a => {
    const active = activePath === a.path ? ' active' : '';
    const soon = a.live ? '' : ' <span class="nav-soon">Soon</span>';
    return `
      <div class="sidebar-item${active}" data-ok-nav="${a.path}" style="display: flex; align-items: center; gap: 10px; padding: 10px 16px; cursor: pointer; transition: all 0.2s; border-left: 3px solid transparent; font-size: 0.9rem;">
        <i class="${getAppIcon(a.code)}" style="width: 18px; text-align: center;"></i>
        <span>${escapeHtml(a.label)}</span>
        ${soon}
      </div>
    `;
  }).join('');

  const adminLink = adminVisible
    ? `
      <div class="sidebar-item${activePath === '/admin' ? ' active' : ''}" data-ok-nav="/admin" style="display: flex; align-items: center; gap: 10px; padding: 10px 16px; cursor: pointer; transition: all 0.2s; border-left: 3px solid transparent; font-size: 0.9rem;">
        <i class="fa-solid fa-shield-halved" style="width: 18px; text-align: center;"></i>
        <span>Admin</span>
      </div>
    `
    : '';

  const homeActive = activePath === '/' ? ' active' : '';
  const profileActive = activePath === '/profile' ? ' active' : '';

  // Get initials for profile badge
  const nameParts = displayName.split(' ').filter(Boolean);
  const initials = nameParts.length >= 2 
    ? (nameParts[0][0] + nameParts[1][0]).toUpperCase()
    : (nameParts[0] ? nameParts[0][0] : 'U').toUpperCase();

  const isDark = document.body.classList.contains('dark');

  return `
    <div class="mobile-header" style="height: 56px; border-bottom: 2px solid var(--border); display: flex; align-items: center; padding: 0 15px; background: var(--header-bg); color: var(--text); position: fixed; top: 0; left: 0; right: 0; z-index: 999;">
      <button type="button" class="menu-toggle" id="okMenuToggle" style="background: none; border: none; color: var(--text); font-size: 1.4rem; cursor: pointer;">☰</button>
      <h1 style="flex: 1; text-align: center; font-size: 1.1rem; font-weight: 700; color: var(--text); margin: 0;">${escapeHtml(title)}</h1>
      <img src="${swamijiImg}" alt="" class="header-logo" width="36" height="36" style="border-radius: 50%;">
    </div>

    <div class="overlay" id="okOverlay"></div>

    <div class="app-shell active">
      <aside class="sidebar" id="sidebar" style="background: var(--sidebar-bg); border-right: 1px solid var(--border); color: #ffffff; display: flex; flex-direction: column;">
        
        <!-- Logo & Branding -->
        <div style="display: flex; align-items: center; gap: 12px; padding: 20px; border-bottom: 1px solid rgba(255,255,255,0.08);">
          <div style="width: 40px; height: 40px; border-radius: 10px; background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%); display: flex; align-items: center; justify-content: center; color: white; font-weight: 700; font-size: 1.25rem; shadow: 0 4px 10px rgba(0,0,0,0.15)">OK</div>
          <div>
            <h1 style="font-size: 1.1rem; font-weight: 700; margin: 0; color: #ffffff; line-height: 1.2;">OneKailasa</h1>
            <p style="font-size: 0.75rem; color: rgba(255,255,255,0.6); margin: 0;">Monastery Operations</p>
          </div>
        </div>

        <!-- User Profile Badge -->
        <div style="padding: 15px; border-bottom: 1px solid var(--border);">
          <div style="display: flex; align-items: center; gap: 10px; padding: 10px; border-radius: var(--radius-sm); background: rgba(255,255,255,0.06);">
            <div style="width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #10b981 0%, #059669 100%); display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 0.9rem;">
              ${initials}
            </div>
            <div style="flex: 1; min-width: 0;">
              <p style="font-size: 0.85rem; font-weight: 600; color: #ffffff; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(displayName)}</p>
              <p style="font-size: 0.75rem; color: rgba(255,255,255,0.6); margin: 0;">Adheenavasi</p>
            </div>
          </div>
        </div>

        <!-- Navigation Menu -->
        <nav class="nav-menu" style="flex: 1; padding: 15px 0; display: flex; flex-direction: column; gap: 4px;">
          <div class="sidebar-item${homeActive}" data-ok-nav="/" style="display: flex; align-items: center; gap: 10px; padding: 10px 16px; cursor: pointer; transition: all 0.2s; border-left: 3px solid transparent; font-size: 0.9rem;">
            <i class="fa-solid fa-house" style="width: 18px; text-align: center;"></i>
            <span>Home</span>
          </div>
          ${appLinks}
          ${adminLink}
          <div class="sidebar-item${profileActive}" data-ok-nav="/profile" style="display: flex; align-items: center; gap: 10px; padding: 10px 16px; cursor: pointer; transition: all 0.2s; border-left: 3px solid transparent; font-size: 0.9rem;">
            <i class="fa-solid fa-user-circle" style="width: 18px; text-align: center;"></i>
            <span>Profile</span>
          </div>
        </nav>

        <!-- Sidebar Footer -->
        <div style="padding: 15px; border-top: 1px solid rgba(255,255,255,0.08); display: flex; flex-direction: column; gap: 10px;">
          <!-- Sign Out Button -->
          <button type="button" onclick="window.handleLogout()" class="card-hover" style="width: 100%; display: flex; align-items: center; gap: 10px; padding: 10px 14px; border: 1px solid rgba(239, 68, 68, 0.2); border-radius: var(--radius-sm); background: rgba(239, 68, 68, 0.08); color: var(--danger); cursor: pointer; font-size: 0.85rem; font-weight: 600; text-align: left;">
            <i class="fa-solid fa-arrow-right-from-bracket" style="width: 16px; text-align: center;"></i>
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      <div class="main-area" style="background: var(--bg); color: var(--text); display: flex; flex-direction: column;">
        <!-- Sticky Glass Header -->
        <header class="app-topbar glass fade-in" style="position: sticky; top: 0; z-index: 100; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; padding: 15px 30px; height: 70px;">
          <div>
            <h2 style="font-size: 1.2rem; font-weight: 700; color: var(--text); margin: 0;">${escapeHtml(title)}</h2>
          </div>
          <div style="display: flex; align-items: center; gap: 15px;">
            <div style="display: flex; align-items: center; gap: 8px; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 6px 12px; background: var(--card-bg); width: 220px;">
              <i class="fa-solid fa-search" style="color: var(--text-muted); font-size: 0.85rem;"></i>
              <input type="text" placeholder="Search operations..." style="border: none; background: transparent; color: var(--text); font-size: 0.8rem; width: 100%; outline: none;">
            </div>
            <button style="border: none; background: transparent; color: var(--text-secondary); cursor: pointer; font-size: 1.1rem; position: relative; padding: 4px;">
              <i class="fa-regular fa-bell"></i>
              <span style="position: absolute; top: 2px; right: 2px; width: 7px; height: 7px; border-radius: 50%; background: var(--danger);"></span>
            </button>
            <img src="${swamijiImg}" alt="" class="app-topbar-logo" width="38" height="38" style="border-radius: 50%; border: 2px solid var(--border);">
          </div>
        </header>

        <main class="main-content fade-in" id="mainContent" style="padding: 30px;">
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

  // Initialize theme icon display based on initial state
  const isDark = document.body.classList.contains('dark');
  const moonIcon = document.getElementById('themeMoonIcon');
  const sunIcon = document.getElementById('themeSunIcon');
  const label = document.getElementById('themeToggleLabel');
  if (moonIcon && sunIcon && label) {
    moonIcon.style.display = isDark ? 'none' : 'inline-block';
    sunIcon.style.display = isDark ? 'inline-block' : 'none';
    label.textContent = isDark ? 'Light Mode' : 'Dark Mode';
  }

  window.toggleTheme = function() {
    const isDark = document.body.classList.toggle('dark');
    localStorage.setItem('ok-theme', isDark ? 'dark' : 'light');
    const moon = document.getElementById('themeMoonIcon');
    const sun = document.getElementById('themeSunIcon');
    const lbl = document.getElementById('themeToggleLabel');
    if (moon && sun && lbl) {
      if (isDark) {
        moon.style.display = 'none';
        sun.style.display = 'inline-block';
        lbl.textContent = 'Light Mode';
      } else {
        moon.style.display = 'inline-block';
        sun.style.display = 'none';
        lbl.textContent = 'Dark Mode';
      }
    }
  };

  document.getElementById('okMenuToggle')?.addEventListener('click', toggleOkSidebar);
  document.getElementById('okOverlay')?.addEventListener('click', toggleOkSidebar);
  document.getElementById('okBottomMore')?.addEventListener('click', () => {
    toggleOkSidebar();
    document.querySelectorAll('.bottom-nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === 'more');
    });
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
