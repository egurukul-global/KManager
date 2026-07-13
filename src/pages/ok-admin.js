// ==================== ONE KAILASA ADMIN (platform people + app access) ====================
import { state } from '../state.js';
import { supabaseClient, SUPABASE_URL, SUPABASE_ANON_KEY } from '../db.js';
import { showToast, showConfirm } from '../components/toasts.js';
import { setButtonLoading } from '../utils/uiHelpers.js';
import {
  isOkAdmin,
  OK_APPS,
  FINANCE_MENU_KEYS,
  navigateOk
} from '../utils/okAccess.js';

let allUsers = [];
let selectedUserId = null;

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

export function getOkAdminPage() {
  if (!isOkAdmin()) {
    return `
      <div class="ok-shell ok-shell--simple">
        <main class="ok-main">
          <h1 class="page-title">One Kailasa Admin</h1>
          <div class="card"><p class="empty-state">Only One Kailasa administrators can open this screen.</p></div>
          <button type="button" class="secondary" data-ok-nav="/">Back to One Kailasa</button>
        </main>
      </div>
    `;
  }

  return `
    <div class="ok-shell ok-shell--admin">
      <aside class="ok-sidebar">
        <div class="ok-brand">
          <span class="ok-brand-mark" aria-hidden="true">🔱</span>
          <div class="ok-brand-title">OK Admin</div>
        </div>
        <nav class="ok-side-nav">
          <button type="button" class="ok-side-link" data-ok-nav="/">← One Kailasa</button>
        </nav>
        <div class="ok-side-footer">
          <button type="button" class="ok-signout" onclick="window.handleLogout()">Sign Out</button>
        </div>
      </aside>
      <main class="ok-main">
        <header class="ok-main-header">
          <h1>People &amp; app access</h1>
          <p>Create logins and decide which apps and Finance menus each person can open.</p>
        </header>

        <div class="ok-admin-grid">
          <section class="card ok-admin-list-card">
            <div class="ok-admin-toolbar">
              <input type="text" id="okAdminSearch" placeholder="Search name or email" oninput="window.filterOkAdminUsers()">
              <button type="button" id="okAdminNewBtn">+ New person</button>
            </div>
            <div id="okAdminUserList" class="ok-admin-user-list"><p class="ok-empty">Loading…</p></div>
          </section>

          <section class="card ok-admin-detail-card" id="okAdminDetail">
            <p class="ok-empty">Select a person to edit access.</p>
          </section>
        </div>

        <div id="okAdminCreateModal" class="modal" style="display:none;">
          <div class="modal-content" style="max-width:440px;">
            <button type="button" class="close-modal" id="okAdminCreateClose">&times;</button>
            <h2>New person</h2>
            <form id="okAdminCreateForm">
              <div class="form-group">
                <label for="okCreateName">Full name</label>
                <input type="text" id="okCreateName" required autocomplete="name">
              </div>
              <div class="form-group">
                <label for="okCreateEmail">Email (login)</label>
                <input type="email" id="okCreateEmail" required autocomplete="email">
              </div>
              <div class="form-group">
                <label for="okCreatePassword">Password (8+)</label>
                <input type="password" id="okCreatePassword" required minlength="8" autocomplete="new-password">
              </div>
              <label class="ok-pin-check"><input type="checkbox" id="okCreateFinance" checked> Grant Finance app</label>
              <div class="btn-group" style="margin-top:16px;">
                <button type="submit" id="okCreateSubmit">Create</button>
                <button type="button" class="secondary" id="okAdminCreateCancel">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  `;
}

export function initOkAdminPage() {
  document.querySelectorAll('[data-ok-nav]').forEach(btn => {
    btn.addEventListener('click', () => navigateOk(btn.getAttribute('data-ok-nav')));
  });

  if (!isOkAdmin()) return;

  window.filterOkAdminUsers = filterOkAdminUsers;
  setupCreateModal();
  loadUsers();
}

async function loadUsers() {
  const { data, error } = await supabaseClient
    .from('users')
    .select('id, email, name, role, on_hold')
    .order('name');
  if (error) {
    showToast(error.message || 'Could not load people', 'error');
    return;
  }
  allUsers = data || [];
  filterOkAdminUsers();
}

function filterOkAdminUsers() {
  const q = (document.getElementById('okAdminSearch')?.value || '').trim().toLowerCase();
  const list = document.getElementById('okAdminUserList');
  if (!list) return;
  const filtered = allUsers.filter(u => {
    if (!q) return true;
    return (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
  });
  if (!filtered.length) {
    list.innerHTML = `<p class="ok-empty">No people found.</p>`;
    return;
  }
  list.innerHTML = filtered.map(u => `
    <button type="button" class="ok-admin-user ${u.id === selectedUserId ? 'active' : ''}" data-user-id="${u.id}">
      <strong>${escapeHtml(u.name || '—')}</strong>
      <span>${escapeHtml(u.email || '')}</span>
      ${u.on_hold ? '<span class="ok-admin-hold">On hold</span>' : ''}
    </button>
  `).join('');
  list.querySelectorAll('[data-user-id]').forEach(btn => {
    btn.addEventListener('click', () => selectUser(btn.getAttribute('data-user-id')));
  });
}

async function selectUser(userId) {
  selectedUserId = userId;
  filterOkAdminUsers();
  const detail = document.getElementById('okAdminDetail');
  const user = allUsers.find(u => u.id === userId);
  if (!detail || !user) return;

  detail.innerHTML = `<p class="ok-empty">Loading access…</p>`;

  const [appsRes, menusRes, adminRes] = await Promise.all([
    supabaseClient.from('ok_app_access').select('app_code, enabled').eq('user_id', userId),
    supabaseClient.from('ok_menu_access').select('menu_key, enabled').eq('user_id', userId).eq('app_code', 'finance'),
    supabaseClient.from('ok_admins').select('user_id').eq('user_id', userId).maybeSingle()
  ]);

  const appSet = new Set((appsRes.data || []).filter(a => a.enabled).map(a => a.app_code));
  const menuSet = new Set((menusRes.data || []).filter(m => m.enabled).map(m => m.menu_key));
  const isAdmin = !!adminRes.data;

  detail.innerHTML = `
    <h2>${escapeHtml(user.name || '—')}</h2>
    <p class="page-intro">${escapeHtml(user.email || '')}</p>

    <div class="btn-group" style="margin-bottom:16px;">
      <button type="button" class="${user.on_hold ? 'secondary' : ''}" id="okToggleHold">
        ${user.on_hold ? 'Clear hold' : 'Put on hold'}
      </button>
      <button type="button" class="secondary" id="okToggleAdmin">
        ${isAdmin ? 'Remove OK Admin' : 'Make OK Admin'}
      </button>
    </div>

    <h3>Apps</h3>
    <div class="ok-access-checks" id="okAppChecks">
      ${OK_APPS.map(a => `
        <label class="ok-pin-check">
          <input type="checkbox" data-app="${a.code}" ${appSet.has(a.code) ? 'checked' : ''}>
          ${escapeHtml(a.label)}${a.live ? '' : ' (soon)'}
        </label>
      `).join('')}
    </div>

    <h3 style="margin-top:20px;">Finance menus</h3>
    <div class="ok-access-checks ok-access-checks--menus" id="okMenuChecks">
      ${FINANCE_MENU_KEYS.map(m => `
        <label class="ok-pin-check">
          <input type="checkbox" data-menu="${m.key}" ${menuSet.has(m.key) ? 'checked' : ''}>
          ${escapeHtml(m.label)}
        </label>
      `).join('')}
    </div>

    <div class="btn-group" style="margin-top:20px;">
      <button type="button" id="okSaveAccess">Save access</button>
    </div>
  `;

  document.getElementById('okToggleHold')?.addEventListener('click', () => toggleHold(user));
  document.getElementById('okToggleAdmin')?.addEventListener('click', () => toggleAdmin(user, isAdmin));
  document.getElementById('okSaveAccess')?.addEventListener('click', () => saveAccess(userId));
}

async function toggleHold(user) {
  const next = !user.on_hold;
  const ok = await showConfirm(next
    ? 'Put this person on hold? They will not be able to sign in.'
    : 'Clear hold so they can sign in again?');
  if (!ok) return;
  const { error } = await supabaseClient.from('users').update({ on_hold: next }).eq('id', user.id);
  if (error) {
    showToast(error.message || 'Update failed', 'error');
    return;
  }
  user.on_hold = next;
  showToast(next ? 'On hold' : 'Hold cleared', 'success');
  filterOkAdminUsers();
  selectUser(user.id);
}

async function toggleAdmin(user, currentlyAdmin) {
  if (currentlyAdmin) {
    const ok = await showConfirm('Remove One Kailasa Admin from this person?');
    if (!ok) return;
    const { error } = await supabaseClient.from('ok_admins').delete().eq('user_id', user.id);
    if (error) return showToast(error.message, 'error');
  } else {
    const { error } = await supabaseClient.from('ok_admins').insert({ user_id: user.id });
    if (error) return showToast(error.message, 'error');
  }
  showToast('Admin updated', 'success');
  selectUser(user.id);
}

async function saveAccess(userId) {
  const apps = [...document.querySelectorAll('#okAppChecks [data-app]')];
  const menus = [...document.querySelectorAll('#okMenuChecks [data-menu]')];

  await supabaseClient.from('ok_app_access').delete().eq('user_id', userId);
  await supabaseClient.from('ok_menu_access').delete().eq('user_id', userId).eq('app_code', 'finance');

  const appRows = apps.filter(i => i.checked).map(i => ({
    user_id: userId,
    app_code: i.getAttribute('data-app'),
    enabled: true
  }));
  const menuRows = menus.filter(i => i.checked).map(i => ({
    user_id: userId,
    app_code: 'finance',
    menu_key: i.getAttribute('data-menu'),
    enabled: true
  }));

  if (appRows.length) {
    const { error } = await supabaseClient.from('ok_app_access').insert(appRows);
    if (error) return showToast(error.message, 'error');
  }
  if (menuRows.length) {
    const { error } = await supabaseClient.from('ok_menu_access').insert(menuRows);
    if (error) return showToast(error.message, 'error');
  }

  // Ensure Finance pin if finance granted and no pins
  if (appRows.some(r => r.app_code === 'finance')) {
    await supabaseClient.from('ok_home_pins').upsert({
      user_id: userId,
      app_code: 'finance',
      sort_order: 0
    }, { onConflict: 'user_id,app_code' });
  }

  showToast('Access saved', 'success');
}

function setupCreateModal() {
  const modal = document.getElementById('okAdminCreateModal');
  const openBtn = document.getElementById('okAdminNewBtn');
  const close = () => { if (modal) modal.style.display = 'none'; };
  openBtn?.addEventListener('click', () => { if (modal) modal.style.display = 'flex'; });
  document.getElementById('okAdminCreateClose')?.addEventListener('click', close);
  document.getElementById('okAdminCreateCancel')?.addEventListener('click', close);

  document.getElementById('okAdminCreateForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('okCreateSubmit');
    const name = document.getElementById('okCreateName').value.trim();
    const email = document.getElementById('okCreateEmail').value.trim();
    const password = document.getElementById('okCreatePassword').value;
    const grantFinance = document.getElementById('okCreateFinance').checked;

    setButtonLoading(btn, true, 'Creating');
    try {
      const { data: sessionData } = await supabaseClient.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Not signed in');

      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY
        },
        body: JSON.stringify({ email, name, password, role: 'user' })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload.error) throw new Error(payload.error || 'Create failed');

      const userId = payload.user_id;
      if (userId && grantFinance) {
        await supabaseClient.from('ok_app_access').upsert({
          user_id: userId,
          app_code: 'finance',
          enabled: true
        }, { onConflict: 'user_id,app_code' });

        const menuRows = FINANCE_MENU_KEYS.map(m => ({
          user_id: userId,
          app_code: 'finance',
          menu_key: m.key,
          enabled: true
        }));
        await supabaseClient.from('ok_menu_access').upsert(menuRows, { onConflict: 'user_id,app_code,menu_key' });
        await supabaseClient.from('ok_home_pins').upsert({
          user_id: userId,
          app_code: 'finance',
          sort_order: 0
        }, { onConflict: 'user_id,app_code' });
      }

      showToast(`Created ${email}`, 'success');
      close();
      document.getElementById('okAdminCreateForm').reset();
      await loadUsers();
      if (userId) selectUser(userId);
    } catch (err) {
      showToast(err.message || 'Create failed', 'error');
    } finally {
      setButtonLoading(btn, false, 'Create');
    }
  });
}
