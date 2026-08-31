// ==================== ONE KAILASA HOME ====================
import {
  hasAppAccess,
  getAppMeta,
  getNotificationMode,
  navigateOk
} from '../utils/okAccess.js';
import { loadActionableApprovalNotifs } from '../utils/approvalEngine.js';
import { state } from '../state.js';
import { supabaseClient } from '../db.js';
import { renderOkShell, initOkShell } from './ok-shell.js';
import kmofLogo from '../../KMOF.png';
import tasksLogo from '../../tasks logo.png';
import konnectLogo from '../../konnect logo.png';

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function appLogoSrc(code) {
  if (code === 'finance') return kmofLogo;
  if (code === 'tasks') return tasksLogo;
  if (code === 'konnect') return konnectLogo;
  return '';
}

function appInitial(code) {
  const meta = getAppMeta(code);
  return (meta?.label || code).slice(0, 1).toUpperCase();
}

function pinnedApps() {
  const pins = (state.okPins || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const codes = pins.map(p => p.app_code).filter(code => hasAppAccess(code));
  if (codes.length > 0) return codes;
  return ['finance', 'tasks', 'konnect', 'gurukul', 'utilities'].filter(code => hasAppAccess(code) || state.isOkAdmin);
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

function openApprovals(actionId, teamId) {
  sessionStorage.setItem('ok_open_page', 'approval-portal');
  if (actionId) sessionStorage.setItem('ok_open_request_id', actionId);
  else sessionStorage.removeItem('ok_open_request_id');
  if (teamId) sessionStorage.setItem('ok_open_team_id', teamId);
  else sessionStorage.removeItem('ok_open_team_id');

  if (parseAppPathSafe() !== 'finance') {
    navigateOk('/finance');
    return;
  }
  if (typeof window.showPage === 'function') {
    window.showPage('approval-portal');
  }
}

function parseAppPathSafe() {
  const raw = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
  const lower = raw.toLowerCase();
  if (lower === '/finance' || lower.startsWith('/finance/')) return 'finance';
  return 'other';
}

const TYPE_LABELS = {
  budget: 'budget request',
  money_transfer: 'transfer request',
  reconciliation_adjustment: 'reconciliation request'
};

function summarizeActionable(rows) {
  const counts = {};
  rows.forEach(r => {
    const cat = String(r.request_type || 'other').toLowerCase();
    counts[cat] = (counts[cat] || 0) + 1;
  });
  return Object.entries(counts).map(([cat, n]) => {
    const base = TYPE_LABELS[cat] || 'other request';
    const plural = n === 1 ? base : `${base}s`;
    return `You have ${n} ${plural}`;
  });
}

function detailLine(row) {
  const type = {
    budget: 'Budget',
    money_transfer: 'Transfer',
    reconciliation_adjustment: 'Reconciliation'
  }[row.request_type] || 'Request';
  const clarify = String(row.status || '').toUpperCase().startsWith('CLARIFY-')
    ? '  Needs reply'
    : '';
  return [row.request_number, row.title, type].filter(Boolean).join('  ') + clarify;
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
  if (!state.user) return;
  const el = document.getElementById('okNotificationsList');
  if (!el) return;

  let rows = [];
  let taskMsgs = [];
  try {
    rows = await loadActionableApprovalNotifs();
  } catch (err) {
    console.warn('approval notifs:', err);
  }

  if (!state.user) return;

  try {
    const { data } = await supabaseClient
      .from('messages')
      .select('*')
      .eq('recipient_type', 'user')
      .eq('recipient_id', state.user.id)
      .eq('metadata->>link_type', 'task')
      .is('read_at', null)
      .order('created_at', { ascending: false });
    taskMsgs = data || [];
  } catch (err) {
    console.warn('task notifs:', err);
  }

  if (!rows.length && !taskMsgs.length) {
    el.innerHTML = '<p class="empty-state">No notifications yet.</p>';
    return;
  }

  let html = '';
  const mode = getNotificationMode();
  
  if (rows.length) {
    if (mode === 'summary') {
      const lines = summarizeActionable(rows);
      html += `
        <button type="button" class="ok-notif ok-notif--summary ok-notif--unread" data-summary="1" style="width:100%; text-align:left; margin-bottom:8px;">
          <span class="ok-notif-line">${escapeHtml(lines.join('. ') + '.')}</span>
        </button>
      `;
    } else {
      html += rows.map(r => `
        <button type="button" class="ok-notif ok-notif--line ok-notif--unread" data-action-id="${escapeHtml(r.id)}" data-team-id="${escapeHtml(r.team_id || '')}" style="width:100%; text-align:left; margin-bottom:8px;">
          <span class="ok-notif-line">${escapeHtml(detailLine(r))}</span>
        </button>
      `).join('');
    }
  }

  if (taskMsgs.length) {
    if (mode === 'summary') {
      html += `
        <button type="button" class="ok-notif ok-notif--summary ok-notif--unread" data-task-summary="1" style="width:100%; text-align:left; margin-bottom:8px; border-left: 4px solid var(--primary);">
          <span class="ok-notif-line">You have ${taskMsgs.length} task updates.</span>
        </button>
      `;
    } else {
      html += taskMsgs.map(m => `
        <button type="button" class="ok-notif ok-notif--line ok-notif--unread" data-task-id="${escapeHtml(m.metadata?.link_id || '')}" data-message-id="${escapeHtml(m.id)}" style="width:100%; text-align:left; margin-bottom:8px; border-left: 4px solid var(--primary);">
          <span class="ok-notif-line">${escapeHtml(m.body)}</span>
        </button>
      `).join('');
    }
  }

  el.innerHTML = html;

  el.querySelectorAll('[data-summary="1"]').forEach(btn => {
    btn.addEventListener('click', () => {
      openApprovals('', '');
    });
  });

  el.querySelectorAll('[data-action-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      openApprovals(
        btn.getAttribute('data-action-id') || '',
        btn.getAttribute('data-team-id') || ''
      );
    });
  });

  el.querySelectorAll('[data-task-summary="1"]').forEach(btn => {
    btn.addEventListener('click', () => {
      window.open('/tasks', '_blank');
    });
  });

  el.querySelectorAll('[data-task-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const taskId = btn.getAttribute('data-task-id');
      if (taskId) {
        window.open(`/tasks?open_id=${taskId}`, '_blank');
      }
    });
  });
}
