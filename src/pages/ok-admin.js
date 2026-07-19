// ==================== ONE KAILASA ADMIN ====================
import { supabaseClient, SUPABASE_URL, SUPABASE_ANON_KEY } from '../db.js';
import { showToast, showConfirm } from '../components/toasts.js';
import { setButtonLoading } from '../utils/uiHelpers.js';
import {
  isOkAdmin,
  OK_APPS,
  FINANCE_MENU_KEYS
} from '../utils/okAccess.js';
import { renderOkShell, initOkShell } from './ok-shell.js';

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
    return renderOkShell({
      activePath: '/admin',
      title: 'Admin',
      bottomTab: 'admin',
      mainHtml: `
        <h1 class="page-title">One Kailasa Admin</h1>
        <div class="card"><p class="empty-state">Only One Kailasa administrators can open this screen.</p></div>
      `
    });
  }

  return renderOkShell({
    activePath: '/admin',
    title: 'Admin',
    bottomTab: 'admin',
    mainHtml: `
      <h1 class="page-title">People &amp; app access</h1>
      <p class="page-intro">Create logins and decide which apps and Finance menus each person can open.</p>

      <div class="card">
        <div class="form-grid-row form-grid-row--user-filters">
          <div class="form-group">
            <label>Search</label>
            <input type="text" id="okAdminSearch" placeholder="Name or email" oninput="window.filterOkAdminUsers()">
          </div>
          <div class="form-group user-mgmt-filter-actions">
            <label>&nbsp;</label>
            <div class="btn-group">
              <button type="button" onclick="window.filterOkAdminUsers()">Search</button>
              <button type="button" class="success" id="okAdminNewBtn">+ New person</button>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <h2>All people</h2>
        <div class="table-container show-desktop">
          <table class="table-stack-mobile user-mgmt-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="okAdminTableBody">
              <tr><td colspan="4" class="empty-state">Loading…</td></tr>
            </tbody>
          </table>
        </div>
        <div id="okAdminMobile" class="show-mobile data-card-list"></div>
      </div>

      <div class="card" id="okAdminDetailCard" style="display:none;">
        <div id="okAdminDetail"></div>
      </div>

      <div id="okAdminCreateModal" class="modal">
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
    `
  });
}

export function initOkAdminPage() {
  initOkShell();
  if (!isOkAdmin()) return;

  window.filterOkAdminUsers = filterOkAdminUsers;
  window.selectOkAdminUser = selectUser;
  setupCreateModal();
  loadUsers();
}

async function loadUsers() {
  const { data, error } = await supabaseClient
    .from('users')
    .select('id, email, name, role, on_hold, gender, clearance_level, escalation_tokens')
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
  const tbody = document.getElementById('okAdminTableBody');
  const mobile = document.getElementById('okAdminMobile');
  const filtered = allUsers.filter(u => {
    if (!q) return true;
    return (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
  });

  if (!filtered.length) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No people found.</td></tr>';
    if (mobile) mobile.innerHTML = '<p class="empty-state">No people found.</p>';
    return;
  }

  if (tbody) {
    tbody.innerHTML = filtered.map(u => `
      <tr class="${u.id === selectedUserId ? 'row-selected' : ''}">
        <td data-label="Name">${escapeHtml(u.name || '—')}</td>
        <td data-label="Email">${escapeHtml(u.email || '')}</td>
        <td data-label="Status">${u.on_hold ? '<span class="status-badge status-hold">On hold</span>' : '<span class="status-badge status-active">Active</span>'}</td>
        <td data-label="">
          <button type="button" class="secondary" onclick="window.selectOkAdminUser('${u.id}')">Select</button>
        </td>
      </tr>
    `).join('');
  }

  if (mobile) {
    mobile.innerHTML = filtered.map(u => `
      <article class="data-card data-card--compact ${u.id === selectedUserId ? 'data-card--selected' : ''}">
        <div class="data-card-top">
          <span class="data-card-title">${escapeHtml(u.name || '—')}</span>
          ${u.on_hold ? '<span class="status-badge status-hold">On hold</span>' : '<span class="status-badge status-active">Active</span>'}
        </div>
        <div class="data-card-row"><span class="data-card-row-label">Email</span><span class="data-card-row-value">${escapeHtml(u.email || '')}</span></div>
        <div class="btn-group" style="margin-top:10px;">
          <button type="button" onclick="window.selectOkAdminUser('${u.id}')">Select</button>
        </div>
      </article>
    `).join('');
  }
}

async function selectUser(userId) {
  selectedUserId = userId;
  filterOkAdminUsers();
  const detailCard = document.getElementById('okAdminDetailCard');
  const detail = document.getElementById('okAdminDetail');
  const user = allUsers.find(u => u.id === userId);
  if (!detail || !user) return;

  if (detailCard) detailCard.style.display = '';
  detail.innerHTML = `<p class="empty-state">Loading access…</p>`;
  detail.scrollIntoView({ behavior: 'smooth', block: 'start' });

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

    <h3 style="margin-top:20px;">Profile & Guardrails</h3>
    <div style="display: flex; gap: 16px; margin-bottom: 20px; flex-wrap: wrap;">
      <div class="form-group" style="flex: 1; min-width: 150px;">
        <label for="okSelectRole">Global Role</label>
        <select id="okSelectRole" class="form-control" style="width: 100%; height: 38px; border-radius: 6px; border: 1px solid var(--border); padding: 6px 12px; background: white;">
          <option value="user" ${user.role === 'user' ? 'selected' : ''}>User</option>
          <option value="fin" ${user.role === 'fin' ? 'selected' : ''}>FIN</option>
          <option value="fip" ${user.role === 'fip' ? 'selected' : ''}>FIP</option>
          <option value="oh" ${user.role === 'oh' ? 'selected' : ''}>OH (FIH)</option>
          <option value="caoh" ${user.role === 'caoh' ? 'selected' : ''}>CAOH (CAO)</option>
          <option value="ceo" ${user.role === 'ceo' ? 'selected' : ''}>CEO</option>
          <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
        </select>
      </div>
      <div class="form-group" style="flex: 1; min-width: 150px;">
        <label for="okSelectGender">Gender</label>
        <select id="okSelectGender" class="form-control" style="width: 100%; height: 38px; border-radius: 6px; border: 1px solid var(--border); padding: 6px 12px; background: white;">
          <option value="male" ${user.gender === 'male' ? 'selected' : ''}>Male</option>
          <option value="female" ${user.gender === 'female' ? 'selected' : ''}>Female</option>
        </select>
      </div>
      <div class="form-group" style="flex: 1; min-width: 150px;">
        <label for="okSelectTokens">Escalation Tokens</label>
        <select id="okSelectTokens" class="form-control" style="width: 100%; height: 38px; border-radius: 6px; border: 1px solid var(--border); padding: 6px 12px; background: white;">
          <option value="1" ${user.escalation_tokens === 1 ? 'selected' : ''}>1</option>
          <option value="2" ${user.escalation_tokens === 2 ? 'selected' : ''}>2</option>
          <option value="3" ${user.escalation_tokens === 3 || user.escalation_tokens === undefined || user.escalation_tokens === null ? 'selected' : ''}>3 (Default)</option>
        </select>
      </div>
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
  const roleValue = document.getElementById('okSelectRole').value;
  const genderValue = document.getElementById('okSelectGender').value;
  const tokensValue = parseInt(document.getElementById('okSelectTokens').value, 10);

  const { error: userUpdateErr } = await supabaseClient
    .from('users')
    .update({
      role: roleValue,
      gender: genderValue,
      escalation_tokens: tokensValue
    })
    .eq('id', userId);

  if (userUpdateErr) return showToast(userUpdateErr.message, 'error');

  const userObj = allUsers.find(u => u.id === userId);
  if (userObj) {
    userObj.role = roleValue;
    userObj.gender = genderValue;
    userObj.escalation_tokens = tokensValue;
  }

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

  const granted = new Set(appRows.map(r => r.app_code));
  const { data: existingPins } = await supabaseClient
    .from('ok_home_pins')
    .select('app_code')
    .eq('user_id', userId);
  for (const pin of existingPins || []) {
    if (!granted.has(pin.app_code)) {
      await supabaseClient
        .from('ok_home_pins')
        .delete()
        .eq('user_id', userId)
        .eq('app_code', pin.app_code);
    }
  }
  if (granted.has('finance')) {
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
  const close = () => { modal?.classList.remove('active'); };
  openBtn?.addEventListener('click', () => { modal?.classList.add('active'); });
  document.getElementById('okAdminCreateClose')?.addEventListener('click', close);
  document.getElementById('okAdminCreateCancel')?.addEventListener('click', close);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

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
