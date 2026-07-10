// ==================== BUCKETS PAGE ====================
import { state } from '../state.js';
import { sbSelect, sbInsert, sbUpdate, sbSoftDelete, sbRestore, localGetAll } from '../db.js';
import { showToast, showConfirm } from '../components/toasts.js';
import { createModal, openModal, closeModal, removeModal } from '../components/modals.js';
import { btnIconEdit, btnIconDelete } from '../utils/uiHelpers.js';

let allBuckets = [];

export function getBucketsPage() {
  return `
    <h1 class="page-title">Money Buckets</h1>

    <div class="card">
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

  // Expose functions to window
  window.openBucketModal = openBucketModal;
  window.toggleShowDeletedBuckets = toggleShowDeletedBuckets;
  window.saveBucket = saveBucket;
  window.loadBucketForEdit = loadBucketForEdit;
  window.confirmDeleteBucket = confirmDeleteBucket;
  window.restoreBucket = restoreBucket;

  await loadBuckets();
}

async function loadBuckets() {
  const teamContainer = document.getElementById('teamBucketsList');
  const personalContainer = document.getElementById('personalBucketsList');
  if (teamContainer) teamContainer.innerHTML = '<div class="empty-state">Loading buckets...</div>';
  if (personalContainer) personalContainer.innerHTML = '<div class="empty-state">Loading buckets...</div>';

  try {
    const { data: buckets, error } = await sbSelect('buckets', {
      teamId: state.currentTeam.team_id,
      includeDeleted: state.showDeleted,
      orderBy: 'name',
      ascending: true
    });

    if (error) throw error;

    allBuckets = buckets || [];
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

function renderBucketGrid(buckets) {
  if (buckets.length === 0) return '';

  let html = '<div class="bucket-grid">';

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

    html += `
      <div class="bucket-card ${isDeleted ? 'deleted' : ''}">
        ${isDeleted ? '<div class="deleted-banner">DELETED</div>' : ''}
        <div class="bucket-header">
          <div class="bucket-header-main">
            <div class="bucket-name">${typeEmoji} ${bucket.name}</div>
            <div class="bucket-type">${bucket.type?.replace(/_/g, ' ') || 'Other'}${isPersonal ? ' · Personal' : ''}</div>
          </div>
          <div class="bucket-header-end">
            <span class="badge badge-info">${bucket.currency}</span>
            <span class="action-icon-group">
              ${canEdit ? btnIconEdit(`window.loadBucketForEdit('${bucket.id}')`) : ''}
              ${canDelete ? btnIconDelete(`window.confirmDeleteBucket('${bucket.id}', '${safeName}')`) : ''}
              ${canRestore ? `<button class="btn-icon btn-icon--edit" onclick="window.restoreBucket('${bucket.id}')" title="Restore">↩</button>` : ''}
            </span>
          </div>
        </div>
        <div class="bucket-balance ${balanceClass}">
          ${(bucket.balance || 0).toLocaleString(undefined, {minimumFractionDigits: 2})} ${bucket.currency}
        </div>
        <div class="bucket-meta">
          <span>💰 Balance: ${(bucket.balance || 0).toLocaleString()} ${bucket.currency}</span>
          <span>📅 ${new Date(bucket.created_at).toLocaleDateString()}</span>
        </div>
      </div>
    `;
  });

  html += '</div>';
  return html;
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
    teamContainer.innerHTML = renderBucketGrid(teamBuckets);
  }

  if (personalBuckets.length === 0) {
    personalContainer.innerHTML = '<div class="empty-state"><p>No personal buckets yet.</p></div>';
  } else {
    personalContainer.innerHTML = renderBucketGrid(personalBuckets);
  }

  if (personalCard) personalCard.style.display = '';
}

// ==================== MODAL FUNCTIONS ====================

export function openBucketModal(bucketId = null) {
  const isEdit = !!bucketId;
  const modalId = 'bucketModal';

  const content = `
    <h2>${isEdit ? '✏️ Edit Bucket' : '➕ Add New Bucket'}</h2>
    <form id="bucketForm" onsubmit="window.saveBucket(event)">
      <input type="hidden" id="bucketId" value="${bucketId || ''}">
      <div class="form-stack">
        <div class="form-grid-row form-grid-row--bucket">
          <div class="form-group"><label>Bucket Name *</label><input type="text" id="bucketName" placeholder="Operations Cash" required></div>
          <div class="form-group"><label>Bucket Type *</label><select id="bucketType" required><option value="">Type</option><option value="cash">💵 Cash</option><option value="bank">🏦 Bank</option><option value="mobile_money">📱 Mobile</option><option value="crypto">₿ Crypto</option><option value="other">📦 Other</option></select></div>
          <div class="form-group"><label>Currency *</label><select id="bucketCurrency" required><option value="">—</option><option value="USD">USD</option><option value="XOF">XOF</option><option value="AED">AED</option><option value="INR">INR</option><option value="EUR">EUR</option><option value="GBP">GBP</option></select></div>
          <div class="form-group"><label>Balance *</label><input type="number" class="input-amount" id="bucketBalance" step="0.01" placeholder="0.00" required></div>
        </div>
        <div class="form-group form-group--checkbox">
          <label class="checkbox-inline" for="bucketPersonal">
            <input type="checkbox" id="bucketPersonal">
            <span>Personal bucket (owned by me)</span>
          </label>
        </div>
      </div>
      <div class="btn-group">
        <button type="submit">${isEdit ? 'Save Changes' : 'Create Bucket'}</button>
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

  if (isEdit && !state.canEditBuckets) {
    showToast('You do not have permission to edit buckets', 'error');
    return;
  }
  if (!isEdit && !state.canCreateBuckets) {
    showToast('You do not have permission to create buckets', 'error');
    return;
  }

  const isPersonal = document.getElementById('bucketPersonal')?.checked;
  const bucketData = {
    name: document.getElementById('bucketName').value.trim(),
    type: document.getElementById('bucketType').value,
    currency: document.getElementById('bucketCurrency').value,
    balance: parseFloat(document.getElementById('bucketBalance').value) || 0,
    owner_user_id: isPersonal ? state.user?.id : null
  };

  if (!bucketData.name) {
    showToast('Bucket name is required', 'error');
    return;
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
      bucketData.team_id = state.currentTeam.team_id;
      bucketData.created_by = state.user.id;
      bucketData.id = crypto.randomUUID();
      bucketData.created_at = new Date().toISOString();
      bucketData.is_deleted = false;

      const { error } = await sbInsert('buckets', bucketData);
      if (error) throw error;
      showToast(`Bucket "${bucketData.name}" created successfully!`, 'success');
    }

    closeModal('bucketModal');
    await loadBuckets();

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
