console.log('=== BUCKETS.JS NEWEST VERSION LOADED ===');
// ==================== BUCKETS PAGE ====================
import { isFinanceGlobalAdmin } from '../utils/appRoles.js';
import { state } from '../state.js';
import { formatMoney } from '../utils/financialStatusHelpers.js';

import { sbSelect, sbInsert, sbUpdate, sbSoftDelete, sbRestore, localGetAll, supabaseClient } from '../db.js';
import { showToast, showConfirm } from '../components/toasts.js';
import { createModal, openModal, closeModal, removeModal } from '../components/modals.js';
import { btnIconEdit, btnIconDelete, cardRow } from '../utils/uiHelpers.js';

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

import {
  formatBucketBalanceDisplay,
  sumBucketBalancesToUsd,
  formatUsdDisplay
} from '../utils/currency.js';
import { hasNonZeroBalance, hasBucketTransactions } from '../utils/balanceGuards.js';
import { filterBucketsForCurrentUser } from '../utils/bucketVisibility.js';
import { isOpsStaff } from '../utils/roleLabels.js';

let allBuckets = [];
let exchangeRates = [];

export function getBucketsPage() {
  return `
    <h1 class="page-title">Money Buckets</h1>


    <div class="card" id="orgBucketsCard" style="display:none; border-left: 4px solid #ea580c;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 10px;">
        <h2>🌍 Org-Level Buckets</h2>
        <div style="display: flex; gap: 10px; align-items: center;">
          <button id="addOrgBucketBtn" class="success" onclick="window.openOrgBucketModal()" style="display: none;">+ Add Org Bucket</button>
        </div>
      </div>
      <p style="color: #666; margin-bottom: 20px;">
        These buckets are organization-wide and managed by FIH. You can assign users (FIP, FIN, etc.) to allow them to transfer funds from these buckets.
      </p>
      <div id="orgBucketsList">Loading org buckets...</div>
    </div>

    <div class="card" id="teamBucketsCard">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 10px;">
        <h2>💰 Team Buckets</h2>
        <div style="display: flex; gap: 10px; align-items: center;">
          <button id="showDeletedBtn" class="secondary small" onclick="window.toggleShowDeletedBuckets()" style="display: none;">
            👁️ Show Deleted
          </button>
          <button id="addBucketBtn" class="success" onclick="window.openBucketModal()" style="display: none;">+ Add Bucket</button>
        </div>
      </div>
      <p style="color: #666; margin-bottom: 20px;">
        Showing buckets for <strong>${state.currentTeam?.team_name || 'current team'}</strong>.
        <span id="bucketAccessNote" style="color: #999; font-size: 0.9em;"></span>
      </p>
      <div id="teamBucketsList">Loading buckets...</div>
    </div>

    <div class="card" id="personalBucketsCard">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 10px;">
        <h2>👤 Personal Buckets</h2>
      </div>
      <p style="color: #666; margin-bottom: 20px;">
        Personal funds owned by team members. Each bucket name must be unique across the team.
      </p>
      <div id="personalBucketsList">Loading buckets...</div>
    </div>
  `;
}

export async function initBucketsPage() {
  // Expose functions to window
  window.openBucketModal = openBucketModal;
  window.toggleShowDeletedBuckets = toggleShowDeletedBuckets;
  window.saveBucket = saveBucket;
  window.loadBucketForEdit = loadBucketForEdit;
  window.confirmDeleteBucket = confirmDeleteBucket;
  window.restoreBucket = restoreBucket;
  // Show/hide buttons based on permissions
  const addBtn = document.getElementById('addBucketBtn');
  const accessNote = document.getElementById('bucketAccessNote');
  const showDeletedBtn = document.getElementById('showDeletedBtn');

  if (state.canCreateBuckets) {
    addBtn.style.display = 'inline-block';
    accessNote.textContent = '';
  } else {
    addBtn.style.display = 'none';
    accessNote.textContent = ' (View only)';
  }

  if (state.canDeleteBuckets && showDeletedBtn) {
    showDeletedBtn.style.display = 'inline-block';
    showDeletedBtn.textContent = state.showDeleted ? '🙈 Hide Deleted' : '👁️ Show Deleted';
  }

  const teamCard = document.getElementById('teamBucketsCard');
  const personalCard = document.getElementById('personalBucketsCard');
  const orgCard = document.getElementById('orgBucketsCard');
  
  const isGlobalView = state.activeViewContext === 'admin';
  const level = String(state.userTeamAccess?.access_level || 'member').toLowerCase().trim();

  if (isGlobalView) {
    if (teamCard) teamCard.style.display = 'none';
    if (personalCard) personalCard.style.display = 'none';
    if (orgCard) orgCard.style.display = 'block';
    
    const role = String(state.user?.role || '').toLowerCase();
    if (['admin', 'ceo', 'caoh', 'oh', 'fih'].includes(role)) {
      const addOrgBtn = document.getElementById('addOrgBucketBtn');
      if (addOrgBtn) addOrgBtn.style.display = 'inline-block';
    }
    
    if (typeof loadOrgBuckets === 'function') {
      await loadOrgBuckets();
    }
    return;
  } else {
    if (orgCard) orgCard.style.display = 'none';
    if (teamCard) teamCard.style.display = isOpsStaff(level) ? 'none' : '';
    if (personalCard) personalCard.style.display = 'block';
  }



  await loadBuckets();
}

async function loadBuckets() {
  const teamContainer = document.getElementById('teamBucketsList');
  const personalContainer = document.getElementById('personalBucketsList');
  if (teamContainer) teamContainer.innerHTML = '<div class="empty-state">Loading buckets...</div>';
  if (personalContainer) personalContainer.innerHTML = '<div class="empty-state">Loading buckets...</div>';

  if (!state.currentTeam?.team_id) {
    if (teamContainer) teamContainer.innerHTML = '<div class="empty-state">No team selected.</div>';
    if (personalContainer) personalContainer.innerHTML = '<div class="empty-state">No team selected.</div>';
    return;
  }

  try {
    const teamId = state.currentTeam.team_id;
    const [bucketsResult, ratesResult] = await Promise.all([
      sbSelect('buckets', {
        teamId,
        includeDeleted: state.showDeleted,
        orderBy: 'name',
        ascending: true
      }),
      sbSelect('exchange_rates', {
        teamId,
        orderBy: 'date',
        ascending: false
      })
    ]);

    const { data: buckets, error } = bucketsResult;
    if (error) throw error;

    exchangeRates = (ratesResult.data || []).filter(r => !r.is_deleted);
    allBuckets = filterBucketsForCurrentUser(buckets || []);
    renderBuckets();

  } catch (err) {
    console.error('Load buckets error:', err);
    const errHtml = `<div class="empty-state" style="color: #dc3545;">Error loading buckets: ${err.message}</div>`;
    if (teamContainer) teamContainer.innerHTML = errHtml;
    if (personalContainer) personalContainer.innerHTML = errHtml;
    showToast('Failed to load buckets', 'error');
  }
}

function normalizeBucketName(name) {
  return (name || '').trim().toLowerCase();
}

function isDuplicateBucketName(name, excludeId = null) {
  const key = normalizeBucketName(name);
  if (!key) return false;
  return allBuckets.some(b =>
    !b.is_deleted &&
    b.id !== excludeId &&
    normalizeBucketName(b.name) === key
  );
}

function renderBucketGrid(buckets, accessMap = null) {
  if (buckets.length === 0) return '';

  let html = '<div class="bucket-data-list data-card-list">';

  buckets.forEach(bucket => {
    const typeEmoji = {
      'cash': '💵', 'bank': '🏦', 'mobile_money': '📱',
      'crypto': '₿', 'other': '📦'
    }[bucket.type] || '💰';

    const balanceClass = (bucket.balance || 0) < 0 ? 'negative' : '';
    const isDeleted = bucket.is_deleted === true;
    const canEdit = state.canEditBuckets && !isDeleted;
    const canDelete = state.canDeleteBuckets && !isDeleted;
    const canRestore = state.canDeleteBuckets && isDeleted;
    const isPersonal = !!bucket.owner_user_id;
    const safeName = (bucket.name || '').replace(/'/g, "\\'");
    const display = formatBucketBalanceDisplay(bucket.balance, bucket.currency, exchangeRates);
    const typeLabel = `${bucket.type?.replace(/_/g, ' ') || 'Other'}${isPersonal ? ' · Personal' : ''}`;

    html += `
      <article class="data-card data-card--compact ${isDeleted ? 'data-card--deleted' : ''}" style="${bucket.is_active === false ? 'opacity: 0.7;' : ''}">
        ${isDeleted ? '<div class="deleted-banner">DELETED</div>' : ''}
        ${bucket.is_active === false && !isDeleted ? '<div class="deleted-banner" style="background:#6b7280; text-align:center;">INACTIVE</div>' : ''}
        <div class="data-card-top">
          <span class="data-card-title">${typeEmoji} ${bucket.name}</span>
          <span class="action-icon-group">
            <span class="badge badge-info">${bucket.currency || '???'}</span>
              ${canEdit ? `<button type="button" class="btn-icon" onclick="window.loadBucketForEdit('${bucket.id}')" title="Edit Bucket" aria-label="Edit Bucket" style="background: none; border: none; color: #48bb78; cursor: pointer; font-size: 1.1em; padding: 4px;"><i class="fas fa-check-square"></i></button>` : ''}
              ${bucket.is_org_level && isFinanceGlobalAdmin() ? `<button type="button" class="btn-icon" onclick="window.openAssignUsersModal('${bucket.id}', '${safeName}')" title="Assign Users" aria-label="Assign Users" style="background: none; border: none; color: #3b82f6; cursor: pointer; font-size: 1.1em; padding: 4px; margin-right: 4px;"><i class="fas fa-plus-square"></i></button>` : ''}
              ${canDelete ? btnIconDelete(`window.confirmDeleteBucket('${bucket.id}', '${safeName}')`) : ''}
            ${canRestore ? `<button type="button" class="btn-icon btn-icon--edit" onclick="window.restoreBucket('${bucket.id}')" title="Restore" aria-label="Restore">↺</button>` : ''}
          </span>
        </div>
        ${cardRow('Type', typeLabel)}
        <div class="data-card-row">
          <span class="data-card-row-label">Balance</span>
          <span class="data-card-row-value ${balanceClass}" style="font-size:1.1em;font-weight:700;">${display.primary}${display.suffix}</span>
        </div>
        ${display.usdLine ? cardRow('USD equiv.', display.usdLine) : ''}
          ${bucket.is_org_level && accessMap ? cardRow('Assigned Users', accessMap[bucket.id] && accessMap[bucket.id].length > 0 ? accessMap[bucket.id].map(u => u.name || u.email).join(', ') : 'No users assigned') : ''}
        ${cardRow('Created', new Date(bucket.created_at).toLocaleDateString())}
      </article>
    `;
  });

  html += '</div>';
  return html;
}

function renderBucketSectionTotal(buckets, label) {
  const { totalUsd, breakdown, missingRates, missingCurrency } = sumBucketBalancesToUsd(buckets, exchangeRates);
  if (!buckets.length) return '';

  const notes = [];
  if (missingRates.length) notes.push(`No exchange rate for: ${missingRates.join(', ')}`);
  if (missingCurrency.length) notes.push(`Currency not set on: ${missingCurrency.join(', ')}`);

  return `
    <div class="bucket-section-total">
      <div class="bucket-section-total-main">
        <span>${label}</span>
        <strong>$${formatUsdDisplay(totalUsd)}</strong>
      </div>
      ${breakdown.length ? `<details class="bucket-section-total-breakdown"><summary>USD breakdown (${buckets.length} bucket${buckets.length === 1 ? '' : 's'})</summary><ul>${breakdown.map(line => `<li>${line}</li>`).join('')}</ul></details>` : ''}
      ${notes.length ? `<p class="bucket-section-total-note">${notes.join(' · ')} — excluded from total</p>` : ''}
    </div>
  `;
}

function renderBuckets() {
  const teamContainer = document.getElementById('teamBucketsList');
  const personalContainer = document.getElementById('personalBucketsList');
  const personalCard = document.getElementById('personalBucketsCard');
  if (!teamContainer || !personalContainer) return;

  const teamBuckets = allBuckets.filter(b => !b.owner_user_id);
  const personalBuckets = allBuckets.filter(b => !!b.owner_user_id);

  if (allBuckets.length === 0) {
    const emptyHtml = `
      <div class="empty-state">
        <div class="icon">💰</div>
        <h3>No buckets yet</h3>
        <p>${state.showDeleted ? 'No deleted buckets found.' : 'Create your first money bucket to get started.'}</p>
        ${!state.showDeleted && state.canCreateBuckets ? '<button class="success" onclick="window.openBucketModal()" style="margin-top: 15px;">+ Create Bucket</button>' : ''}
      </div>
    `;
    teamContainer.innerHTML = emptyHtml;
    personalContainer.innerHTML = state.showDeleted
      ? '<div class="empty-state"><p>No deleted personal buckets.</p></div>'
      : '<div class="empty-state"><p>No personal buckets yet.</p></div>';
    if (personalCard) personalCard.style.display = '';
    return;
  }

  if (teamBuckets.length === 0) {
    teamContainer.innerHTML = '<div class="empty-state"><p>No team buckets yet.</p></div>';
  } else {
    teamContainer.innerHTML = renderBucketGrid(teamBuckets) + renderBucketSectionTotal(teamBuckets, 'Team total (USD equiv.) — matches Dashboard');
  }

  if (personalBuckets.length === 0) {
    personalContainer.innerHTML = '<div class="empty-state"><p>No personal buckets yet.</p></div>';
  } else {
    personalContainer.innerHTML = renderBucketGrid(personalBuckets) + renderBucketSectionTotal(personalBuckets, 'Personal total (USD equiv.)');
  }

  if (personalCard) personalCard.style.display = '';
}

// ==================== MODAL FUNCTIONS ====================
export function openBucketModal(bucketId = null) {
  const isEdit = !!bucketId;
  const modalId = 'bucketModal';

  const content = `
    <h2 id="bucketModalTitle">${isEdit ? '✏️ Edit Bucket' : '➕ Add New Bucket'}</h2>
    <form id="bucketForm" onsubmit="event.preventDefault(); window.saveBucket(event);">
      <input type="hidden" id="bucketId" value="${bucketId || ''}">
      <div class="form-stack">
        <div class="form-grid-row form-grid-row--bucket">
          <div class="form-group"><label>Bucket Name *</label><input type="text" id="bucketName" placeholder="Operations Cash" required></div>
          <div class="form-group"><label>Bucket Type *</label><select id="bucketType" required><option value="">Type</option><option value="cash">💵 Cash</option><option value="bank">🏦 Bank</option><option value="mobile_money">📱 Mobile</option><option value="crypto">🪙 Crypto</option><option value="other">📦 Other</option></select></div>
          <div class="form-group"><label>Currency *</label><select id="bucketCurrency" required><option value="">🌎</option><option value="USD">USD</option><option value="XOF">XOF</option><option value="AED">AED</option><option value="INR">INR</option><option value="EUR">EUR</option><option value="GBP">GBP</option></select></div>
          <div class="form-group"><label>Balance *</label><input type="number" class="input-amount" id="bucketBalance" step="0.01" placeholder="0.00" required></div>
        </div>
        <div class="form-group form-group--checkbox" style="display: flex; gap: 20px;">
          <label class="checkbox-inline" for="bucketPersonal">
            <input type="checkbox" id="bucketPersonal">
            <span>Personal bucket (owned by me)</span>
          </label>
          <label class="checkbox-inline" for="bucketActive">
            <input type="checkbox" id="bucketActive" checked>
            <span>Active</span>
          </label>
        </div>
      </div>
      <div class="btn-group">
        <button type="button" onclick="window.saveBucket(event)">${isEdit ? 'Save Changes' : 'Create Bucket'}</button>
        <button type="button" class="secondary" onclick="document.getElementById('${modalId}').classList.remove('active')">Cancel</button>
      </div>
    </form>
  `;

  createModal(modalId, content);
  openModal(modalId);

  if (isEdit) {
    loadBucketData(bucketId);
  }
}

async function loadBucketData(bucketId) {
  try {
    const bucket = allBuckets.find(b => b.id === bucketId);
    if (!bucket) {
      showToast('Bucket not found', 'error');
      return;
    }

    document.getElementById('bucketName').value = bucket.name;
    document.getElementById('bucketType').value = bucket.type;
    document.getElementById('bucketCurrency').value = bucket.currency;
    document.getElementById('bucketBalance').value = bucket.balance;
    const personalEl = document.getElementById('bucketPersonal');
    if (personalEl) {
      personalEl.checked = bucket.owner_user_id === state.user?.id;
    }
    const activeEl = document.getElementById('bucketActive');
    if (activeEl) {
      activeEl.checked = bucket.is_active !== false;
    }
    const modalEl = document.getElementById('bucketModal');
    if (modalEl) {
      if (bucket.is_org_level) {
        modalEl.dataset.isOrg = 'true';
      } else {
        delete modalEl.dataset.isOrg;
      }
    }

    const hasTx = await hasBucketTransactions(bucketId);
    if (hasTx) {
      const balEl = document.getElementById('bucketBalance');
      const curEl = document.getElementById('bucketCurrency');
      if (balEl) {
        balEl.disabled = true;
        balEl.title = "Balance cannot be edited directly once transactions have occurred.";
      }
      if (curEl) {
        curEl.disabled = true;
        curEl.title = "Currency cannot be changed once transactions have occurred.";
      }
    }
  } catch (err) {
    console.error('Load bucket for edit error:', err);
    showToast('Failed to load bucket details', 'error');
    closeModal('bucketModal');
  }
}

export async function saveBucket(e) {
  e.preventDefault();

  const bucketId = document.getElementById('bucketId').value;
  const isEdit = !!bucketId;
  const modalEl = document.getElementById('bucketModal');
  const isOrgBucket = modalEl?.getAttribute('data-is-org') === 'true' || modalEl?.dataset?.isOrg === 'true';
  // Rely entirely on DB RLS for permissions per user request
  // Removed hardcoded role bypasses

  const isPersonal = !!document.getElementById('bucketPersonal')?.checked && !isOrgBucket;
  const isActive = document.getElementById('bucketActive') ? !!document.getElementById('bucketActive').checked : true;
  const bucketData = {
    name: document.getElementById('bucketName').value.trim(),
    type: document.getElementById('bucketType').value,
    currency: document.getElementById('bucketCurrency').value,
    balance: parseFloat(document.getElementById('bucketBalance').value) || 0,
    owner_user_id: isPersonal ? state.user?.id : null,
    is_org_level: isOrgBucket,
    team_id: state.currentTeam?.team_id,
    is_active: isActive
  }

  if (isDuplicateBucketName(bucketData.name, isEdit ? bucketId : null)) {
    showToast(`A bucket named "${bucketData.name}" already exists. Names must be unique.`, 'error');
    return;
  }

  try {
    if (isEdit) {
      const { error } = await sbUpdate('buckets', bucketData, { id: bucketId });
      if (error) throw error;
      showToast(`Bucket "${bucketData.name}" updated successfully!`, 'success');
    } else {
      const isOrgBucket = document.getElementById('bucketModal')?.dataset?.isOrg === 'true';
      if (isOrgBucket) {
        bucketData.is_org_level = true;
        bucketData.team_id = state.currentTeam?.team_id; // DB requires team_id to not be null
      } else {
        bucketData.team_id = state.currentTeam?.team_id;
      }
      bucketData.created_by = state.user.id;
      bucketData.id = crypto.randomUUID();
      bucketData.created_at = new Date().toISOString();
      bucketData.is_deleted = false;

      const { error } = await sbInsert('buckets', bucketData);
      if (error) throw error;
      showToast(`Bucket "${bucketData.name}" created successfully!`, 'success');
    }

    closeModal('bucketModal');
    if (isOrgBucket || state.activeViewContext === 'admin' || !state.currentTeam?.team_id) {
      await loadOrgBuckets();
    } else {
      await loadBuckets();
    }

  } catch (err) {
    console.error('Save bucket error:', err);
    const msg = err.message || '';
    if (msg.includes('idx_buckets_team_name_unique') || msg.includes('duplicate key')) {
      showToast(`A bucket named "${bucketData.name}" already exists. Names must be unique.`, 'error');
    } else {
      showToast('Failed to save bucket: ' + msg, 'error');
    }
  }
}

export async function loadBucketForEdit(bucketId) {
  openBucketModal(bucketId);
}

export function confirmDeleteBucket(bucketId, bucketName) {
  const bucket = allBuckets.find(b => b.id === bucketId);
  if (bucket?.is_protected) {
    showToast('This bucket is protected and cannot be deleted.', 'error');
    return;
  }

  if (hasNonZeroBalance(bucket?.balance)) {
    showToast(
      `Cannot delete "${bucketName}": balance must be zero (current: ${(parseFloat(bucket.balance) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} ${bucket.currency || ''})`,
      'error'
    );
    return;
  }

  showConfirm(
    `Are you sure you want to delete <strong>${bucketName}</strong>?<br><br>The bucket will be soft-deleted and can be restored later.`,
    async () => {
      if (!state.canDeleteBuckets) {
        showToast('You do not have permission to delete buckets', 'error');
        return;
      }

      try {
        const { error } = await sbSoftDelete('buckets', bucketId);
        if (error) throw error;
        showToast('Bucket soft-deleted successfully', 'success');
        await loadBuckets();
      } catch (err) {
        console.error('Delete bucket error:', err);
        showToast('Failed to delete bucket: ' + err.message, 'error');
      }
    }
  );
}

export async function restoreBucket(bucketId) {
  if (!state.canDeleteBuckets) {
    showToast('You do not have permission to restore buckets', 'error');
    return;
  }

  try {
    const { error } = await sbRestore('buckets', bucketId);
    if (error) throw error;
    showToast('Bucket restored successfully', 'success');
    await loadBuckets();
  } catch (err) {
    console.error('Restore bucket error:', err);
    showToast('Failed to restore bucket: ' + err.message, 'error');
  }
}

export function toggleShowDeletedBuckets() {
  state.showDeleted = !state.showDeleted;
  const btn = document.getElementById('showDeletedBtn');
  if (btn) {
    btn.textContent = state.showDeleted ? '🙈 Hide Deleted' : '👁️ Show Deleted';
  }
  loadBuckets();
}

async function loadOrgBuckets() {
  try {
    const { data, error } = await supabaseClient
      .from('buckets')
      .select('*')
      .eq('is_org_level', true)
      .eq('is_deleted', false)
      .order('name');
      
    if (error) throw error;
      allBuckets = data || [];
    
    const list = document.getElementById('orgBucketsList');
    if (!list) return;
    
    if (!data || data.length === 0) {
      list.innerHTML = '<p class="empty-state">No organization-level buckets found.</p>';
      return;
    }
    
    // Also fetch bucket access to show assigned users count
    const { data: accessData } = await supabaseClient
      .from('bucket_access')
      .select('bucket_id, user_id');
      
    const userIds = [...new Set((accessData || []).map(r => r.user_id))];
    let usersMap = {};
    if (userIds.length > 0) {
      const { data: usersData } = await supabaseClient.from('users').select('id, name, email').in('id', userIds);
      if (usersData) {
        usersData.forEach(u => usersMap[u.id] = u);
      }
    }
    
    const accessMap = {};
    if (accessData) {
      accessData.forEach(row => {
        if (!accessMap[row.bucket_id]) accessMap[row.bucket_id] = [];
        if (usersMap[row.user_id]) accessMap[row.bucket_id].push(usersMap[row.user_id]);
      });
    }
    
    const role = String(state.user?.role || '').toLowerCase();
    const canManage = ['admin', 'ceo', 'caoh', 'oh', 'fih'].includes(role);

    list.innerHTML = renderBucketGrid(data, accessMap);
    
  } catch (err) {
    console.error('Error loading org buckets:', err);
    showToast('Failed to load org buckets.', 'error');
  }
}

window.openOrgBucketModal = function() {
  openBucketModal();
  const modal = document.getElementById('bucketModal');
  if (!modal) return;
  const row = document.getElementById('bucketPersonalRow');
  if (row) row.style.display = 'none';

  document.getElementById('bucketId').value = '';
  document.getElementById('bucketName').value = '';
  document.getElementById('bucketCurrency').value = state.currentTeam?.currency || 'USD';
  document.getElementById('bucketType').value = 'bank';
  document.getElementById('bucketBalance').value = '0';

  modal.dataset.isOrg = 'true';
  const title = document.getElementById('bucketModalTitle');
  if (title) title.textContent = 'Add Org-Level Bucket';
  modal.classList.add('active');
};

// Inject Assign Users Modal
  if (!document.getElementById('assignUsersModal')) {
    const modalHtml = `
      <div id="assignUsersModal" class="modal">
        <div class="modal-content" style="max-width: 700px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <h2 style="margin: 0; font-size: 1.3em;">Manage Access: <span id="assignBucketName"></span></h2>
            <button type="button" class="sq-btn secondary" style="padding: 6px 16px; font-size: 0.9em;" onclick="document.getElementById('assignUsersModal').classList.remove('active')">Close</button>
          </div>
          <input type="hidden" id="assignBucketId" />
          
          <div style="margin-bottom: 20px;">
            <h3 style="font-size: 1.0em; margin-bottom: 10px;">Assign New User</h3>
            <div class="form-group" style="display:flex; gap: 8px; align-items: end; flex-wrap: wrap;">
              <div style="flex: 2; min-width: 200px;">
                <label>Search user</label>
                <input type="text" id="assignUserSearch" placeholder="Type a name or email..." onkeyup="window.filterBucketAssignUsers()" autocomplete="off" style="width:100%; padding: 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.2); color: white;" />
              </div>
              <div style="flex: 1; min-width: 120px;">
                <label>Role</label>
                <select id="assignRoleFilter" onchange="window.filterBucketAssignUsers()" style="width:100%; padding: 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.2); color: white;">
                  <option value="">All</option>
                  <option value="user">User</option>
                  <option value="fin">FIN</option>
                  <option value="fip">FIP</option>
                  <option value="fih">FIH</option>
                  <option value="oh">OH</option>
                  <option value="caoh">CAOH</option>
                </select>
              </div>
            </div>
            
            <div class="form-group">
              <label>Select user</label>
              <select id="assignUserSelect" style="width:100%; padding: 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.2); color: white;" onchange="window.renderSelectedUserAccess()">
                <option value="">Loading users...</option>
              </select>
            </div>
            
            <div id="assignUserAccessBox" style="margin-top: 10px; display: none;">
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; background: rgba(255,255,255,0.02); flex-wrap: wrap; gap: 8px;">
                <div style="display: flex; gap: 16px; align-items: center; flex-wrap: wrap;">
                  <span style="font-weight: 600; font-size: 0.9em;">Permissions:</span>
                  <label style="display:flex; align-items:center; gap:4px; margin:0; font-size: 0.9em;">
                    <input type="checkbox" id="assignCanViewBalance" /> View balance
                  </label>
                  <label style="display:flex; align-items:center; gap:4px; margin:0; font-size: 0.9em;">
                    <input type="checkbox" id="assignCanTransfer" /> Can transfer
                  </label>
                </div>
                <div style="display: flex; gap: 8px;">
                  <button type="button" class="sq-btn primary" style="padding: 4px 12px; font-size: 0.85em;" onclick="window.saveBucketAccess()">+ Assign User</button>
                </div>
              </div>
            </div>
          </div>
          
          <hr style="border: 1px solid rgba(255,255,255,0.1); margin: 20px 0;">
          
          <div style="margin-bottom: 20px;">
            <h3 style="font-size: 1.0em; margin-bottom: 10px;">Assigned Users</h3>
            <div id="assignedUsersList">Loading...</div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  }

let allAssignUsers = [];
let currentAssignBucket = null;

async function loadAssignableUsersForBucket(bucketId) {
  const s = document.getElementById('assignUserSelect');
  if (s) s.innerHTML = '<option value=\"\">Step 1: start</option>';
  let directUsers = [];
  let directLookupError = null;

  try {
    const { data, error } = await supabaseClient
      .from('users')
      .select('id, name, email, role')
      .order('name');

    if (error) throw error;
    directUsers = data || [];
  } catch (err) {
    directLookupError = err;
    console.warn('Direct users lookup failed:', err);

    try {
      const { data: teamRows } = await supabaseClient.from('user_teams').select('user_id');
      const userIds = [...new Set((teamRows || []).map(r => r.user_id).filter(Boolean))];
      if (userIds.length) {
        const { data: fallbackUsers, error: fallbackError } = await supabaseClient
          .from('users')
          .select('id, name, email, role')
          .in('id', userIds)
          .order('name');
        if (fallbackError) throw fallbackError;
        directUsers = fallbackUsers || [];
      }
    } catch (fallbackErr) {
      console.warn('Fallback user lookup failed:', fallbackErr);
      directUsers = [];
    }
  }

  const unique = {};
  (directUsers || []).forEach(u => {
    if (u && u.id) unique[u.id] = u;
  });

  try {
    const { data: accessData } = await supabaseClient
      .from('bucket_access')
      .select('user_id, can_transfer, can_view_balance')
      .eq('bucket_id', bucketId);

    if (s) s.innerHTML = '<option value=\"\">Step 5: mapping access</option>';
      const accessMap = new Map((accessData || []).map(row => [row.user_id, row]));
    allAssignUsers = Object.values(unique)
      .sort((a, b) => String(a.name || a.email || '').localeCompare(String(b.name || b.email || '')))
      .map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role || 'user',
        is_assigned: accessMap.has(u.id),
          can_transfer: !!(accessMap.get(u.id)?.can_transfer ?? false),
        can_view_balance: !!(accessMap.get(u.id)?.can_view_balance ?? false)
      }));

    if (s) s.innerHTML = '<option value=\"\">Step 7: finished loadAssignableUsers</option>';
      if (!allAssignUsers.length && directLookupError) {
      console.warn('No assignable users loaded for bucket. Direct lookup failed:', directLookupError.message || directLookupError);
    }
  } catch (err) {
    console.warn('Bucket access lookup failed:', err);
    allAssignUsers = Object.values(unique).sort((a, b) => String(a.name || a.email || '').localeCompare(String(b.name || b.email || '')));
  }
}


window.renderAssignedUsers = function() {
  const list = document.getElementById('assignedUsersList');
  if (!list) return;
  const assigned = allAssignUsers.filter(u => u.is_assigned);
  if (assigned.length === 0) {
    list.innerHTML = '<p class="empty-state" style="margin:0;">No users assigned.</p>';
    return;
  }
  
  list.innerHTML = `
    <table style="width:100%; border-collapse: collapse; text-align: left; font-size: 0.8em;">
      <thead>
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.2);">
          <th style="padding: 2px;">User</th>
          <th style="padding: 2px; text-align: center;">View Balance</th>
          <th style="padding: 2px; text-align: center;">Can Transfer</th>
          <th style="padding: 2px; text-align: center;">Save</th>
          <th style="padding: 2px; text-align: center;">Delete</th>
        </tr>
      </thead>
      <tbody>
        ${assigned.map(u => `
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); height: 24px;">
            <td style="padding: 2px; margin: 0;">${escapeHtml(u.name || u.email)} <small style="color:#aaa;">(${escapeHtml(String(u.role).toUpperCase())})</small></td>
            <td style="padding: 2px; text-align: center; margin: 0;"><input type="checkbox" id="chk_view_${u.id}" ${u.can_view_balance ? 'checked' : ''} style="transform: scale(0.85); margin: 0;" /></td>
            <td style="padding: 2px; text-align: center; margin: 0;"><input type="checkbox" id="chk_trans_${u.id}" ${u.can_transfer ? 'checked' : ''} style="transform: scale(0.85); margin: 0;" /></td>
            <td style="padding: 2px; text-align: center; margin: 0;">
              <button onclick="window.saveRowAccess('${u.id}')" title="Save" style="background: none; border: none; color: #48bb78; cursor: pointer; font-size: 1.1em; padding: 0;"><i class="fas fa-check-square"></i></button>
            </td>
            <td style="padding: 2px; text-align: center; margin: 0;">
              <button onclick="window.removeRowAccess('${u.id}')" title="Remove" style="background: none; border: none; color: #f56565; cursor: pointer; font-size: 1.1em; padding: 0;"><i class="fas fa-times"></i></button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
};

window.saveRowAccess = async function(userId) {
  if (!currentAssignBucket || !userId) return;
  const can_view = !!document.getElementById(`chk_view_${userId}`)?.checked;
  const can_trans = !!document.getElementById(`chk_trans_${userId}`)?.checked;
  
  try {
    const payload = {
      bucket_id: currentAssignBucket,
      user_id: userId,
      can_transfer: can_trans,
      can_view_balance: can_view,
      assigned_by: state.user.id
    };
    const { error } = await supabaseClient.from('bucket_access').upsert([payload], { onConflict: 'bucket_id,user_id' });
    if (error) throw error;
    
    const user = allAssignUsers.find(u => u.id === userId);
    if (user) {
      user.can_transfer = can_trans;
      user.can_view_balance = can_view;
    }
    await loadOrgBuckets();
    window.renderAssignedUsers();
    showToast('Changes saved', 'success');
  } catch (err) {
    console.error(err);
    showToast('Failed to save changes.', 'error');
  }
};

window.removeRowAccess = async function(userId) {
  if (!currentAssignBucket || !userId) return;
  const user = allAssignUsers.find(u => u.id === userId);
  const name = user ? (user.name || user.email) : 'this user';
  
  showConfirm(`Are you sure you want to remove access for <b>${name}</b>?`, async () => {
    try {
      const { error } = await supabaseClient.from('bucket_access').delete().eq('bucket_id', currentAssignBucket).eq('user_id', userId);
      if (error) throw error;
      
      if (user) {
        user.is_assigned = false;
        user.can_transfer = false;
        user.can_view_balance = false;
      }
      await loadOrgBuckets();
      window.renderAssignedUsers();
      showToast('User removed successfully', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to remove user.', 'error');
    }
  });
};

window.openAssignUsersModal = async function(bucketId, bucketName) {
  
    console.log('openAssignUsersModal START');
  currentAssignBucket = bucketId;
  const modal = document.getElementById('assignUsersModal');
  const searchInput = document.getElementById('assignUserSearch');
  const select = document.getElementById('assignUserSelect');
  const accessBox = document.getElementById('assignUserAccessBox');

  if (!modal || !searchInput || !select || !accessBox) {
    showToast('Assign modal is not ready. Please reopen it.', 'error');
    return;
  }

  document.getElementById('assignBucketId').value = bucketId;
  document.getElementById('assignBucketName').textContent = bucketName;
  modal.classList.add('active');
  searchInput.value = '';
  select.innerHTML = '<option value=\"\">Loading users...</option>';
      accessBox.style.display = 'none';

  try {
    await loadAssignableUsersForBucket(bucketId);

    if (!allAssignUsers.length) {
      select.innerHTML = '<option value="">No users available</option>';
      accessBox.style.display = 'none';
      showToast('No users are available to assign to this bucket.', 'warning');
      return;
    }

    if (select) select.innerHTML = '<option value=\"\">Step 8: calling filter</option>';
      window.filterBucketAssignUsers();
      if (select && select.innerHTML.includes('Step 8')) select.innerHTML = '<option value=\"\">Step 9: filter finished</option>';
      window.renderAssignedUsers();
    } catch (err) {
    console.error(err);
    select.innerHTML = '<option value="">Error loading users</option>';
    accessBox.style.display = 'none';
    showToast('Could not load users for this bucket. Check the user RLS policy.', 'error');
  }
};

window.filterBucketAssignUsers = function() {
  const q = (document.getElementById('assignUserSearch')?.value || '').trim().toLowerCase();
  const roleFilter = (document.getElementById('assignRoleFilter')?.value || '').toLowerCase();
  const select = document.getElementById('assignUserSelect');
  const accessBox = document.getElementById('assignUserAccessBox');
  if (!select) return;

  const filtered = allAssignUsers.filter(u => {
    const haystack = `${u.name || ''} ${u.email || ''} ${u.role || ''}`.toLowerCase();
    const matchesSearch = !q || haystack.includes(q);
    const normalizedRole = String(u.role || 'user').toLowerCase();
    const roleMatches = !roleFilter || (
      roleFilter === 'user'
        ? !['fin', 'fip', 'fih', 'oh', 'caoh', 'admin', 'ceo', 'cao'].includes(normalizedRole)
        : normalizedRole === roleFilter
    );
    return matchesSearch && roleMatches;
  });

  if (filtered.length === 0) {
    select.innerHTML = '<option value="">No users found</option>';
    if (accessBox) accessBox.style.display = 'none';
    return;
  }

  select.innerHTML = '<option value="">Select user…</option>' + filtered.map(u => `<option value="${u.id}">${escapeHtml(u.name || u.email || 'Unknown')} (${escapeHtml(String(u.role || 'user').toUpperCase())})</option>`).join('');
  const currentValue = select.value || filtered[0].id;
  if ([...select.options].some(option => option.value === currentValue)) {
    select.value = currentValue;
  } else {
    select.selectedIndex = 0;
  }
  if (accessBox) {
    accessBox.style.display = 'block';
  }
  window.renderSelectedUserAccess();
};

window.renderSelectedUserAccess = function() {
  const userId = document.getElementById('assignUserSelect')?.value;
  const box = document.getElementById('assignUserAccessBox');
  if (!userId || !box) return;

  const user = allAssignUsers.find(u => u.id === userId);
  if (!user) {
    box.style.display = 'none';
    return;
  }

  document.getElementById('assignCanViewBalance').checked = !!user.can_view_balance;
  document.getElementById('assignCanTransfer').checked = !!user.can_transfer;
  box.style.display = 'block';
};

window.assignSelectedUser = function() {
  const userId = document.getElementById('assignUserSelect')?.value;
  if (!userId) {
    document.getElementById('assignUserAccessBox').style.display = 'none';
    return;
  }
  window.renderSelectedUserAccess();
};


  window.removeBucketAccess = async function() {
    if (!currentAssignBucket) return;
    const userId = document.getElementById('assignUserSelect')?.value;
    if (!userId) return;

    try {
      const { error } = await supabaseClient.from('bucket_access').delete().eq('bucket_id', currentAssignBucket).eq('user_id', userId);
      if (error) throw error;

      const user = allAssignUsers.find(u => u.id === userId);
      if (user) {
        user.is_assigned = false;
        user.can_transfer = false;
        user.can_view_balance = false;
      }

      await loadOrgBuckets();
      document.getElementById('assignUsersModal').classList.remove('active');
      showToast('User access removed', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to remove access.', 'error');
    }
  };

  window.saveBucketAccess = async function() {
  if (!currentAssignBucket) return;
  const userId = document.getElementById('assignUserSelect')?.value;
  if (!userId) {
    showToast('Select a user first', 'error');
    return;
  }

  try {
    const payload = {
      bucket_id: currentAssignBucket,
      user_id: userId,
      can_transfer: !!document.getElementById('assignCanTransfer')?.checked,
      can_view_balance: !!document.getElementById('assignCanViewBalance')?.checked,
      assigned_by: state.user.id
    };

    const { error: upsertErr } = await supabaseClient.from('bucket_access').upsert([payload], { onConflict: 'bucket_id,user_id' });
      if (upsertErr) throw upsertErr;

    const user = allAssignUsers.find(u => u.id === userId);
    if (user) {
      user.can_transfer = payload.can_transfer;
      user.can_view_balance = payload.can_view_balance;
    }

    await loadOrgBuckets();
    if (user) user.is_assigned = true;
    window.renderAssignedUsers();
    document.getElementById('assignUserAccessBox').style.display = 'none';
    document.getElementById('assignUserSelect').value = '';
    showToast('User assigned', 'success');
  } catch (err) {
    console.error(err);
    showToast('Failed to save bucket access.', 'error');
  }
};



window.saveBucket = saveBucket;
