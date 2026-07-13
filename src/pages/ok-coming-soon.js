// ==================== COMING SOON APP PLACEHOLDER ====================
import { getAppMeta, hasAppAccess } from '../utils/okAccess.js';
import { renderOkShell, initOkShell } from './ok-shell.js';

export function getComingSoonPage(appCode) {
  const meta = getAppMeta(appCode) || { label: appCode, path: `/${appCode}` };
  const allowed = hasAppAccess(appCode);

  return renderOkShell({
    activePath: meta.path || `/${appCode}`,
    title: meta.label || 'App',
    bottomTab: 'home',
    mainHtml: `
      <h1 class="page-title">${meta.label}</h1>
      <div class="card">
        <p class="empty-state">
          ${allowed
            ? 'This app is coming soon.'
            : 'You do not have access to this app. Contact a One Kailasa administrator.'}

        </p>
      </div>
    `
  });
}

export function initComingSoonPage() {
  initOkShell();
}
