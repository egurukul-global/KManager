// ==================== COMING SOON APP PLACEHOLDER ====================
import { getAppMeta, navigateOk, hasAppAccess } from '../utils/okAccess.js';

export function getComingSoonPage(appCode) {
  const meta = getAppMeta(appCode) || { label: appCode, description: 'Coming soon' };
  const allowed = hasAppAccess(appCode);

  return `
    <div class="ok-shell ok-shell--simple">
      <main class="ok-main ok-coming-soon">
        <button type="button" class="link-btn" data-ok-nav="/">← Back to One Kailasa</button>
        <h1>${meta.label}</h1>
        ${allowed
          ? `<p class="ok-coming-msg">This app is coming soon.</p>`
          : `<p class="ok-coming-msg">You do not have access to this app. Contact a One Kailasa administrator.</p>`
        }
      </main>
    </div>
  `;
}

export function initComingSoonPage() {
  document.querySelectorAll('[data-ok-nav]').forEach(btn => {
    btn.addEventListener('click', () => navigateOk(btn.getAttribute('data-ok-nav')));
  });
}
