const fs = require('fs');
let code = fs.readFileSync('src/pages/buckets.js', 'utf8');

const correctSaveBucket = `
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
    showToast('A bucket named "' + bucketData.name + '" already exists. Names must be unique.', 'error');
    return;
  }

  try {
    if (isEdit) {
      const { error } = await sbUpdate('buckets', bucketData, { id: bucketId });
      if (error) throw error;
      showToast('Bucket "' + bucketData.name + '" updated successfully!', 'success');
    } else {
      const isOrgBucket = document.getElementById('bucketModal')?.dataset?.isOrg === 'true';
      if (isOrgBucket) {
        bucketData.is_org_level = true;
        bucketData.team_id = null;
      } else {
        bucketData.team_id = state.currentTeam.team_id;
      }
      bucketData.created_by = state.user.id;
      bucketData.id = crypto.randomUUID();
      bucketData.created_at = new Date().toISOString();
      bucketData.is_deleted = false;

      const { error } = await sbInsert('buckets', bucketData);
      if (error) throw error;
      showToast('Bucket "' + bucketData.name + '" created successfully!', 'success');
    }

    closeModal('bucketModal');
    await loadBuckets();

  } catch (err) {
    console.error('Save bucket error:', err);
    const msg = err.message || '';
    if (msg.includes('idx_buckets_team_name_unique') || msg.includes('duplicate key')) {
      showToast('A bucket named "' + bucketData.name + '" already exists. Names must be unique.', 'error');
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
`;

code = code.replace(/const bucketData = \{[\s\S]*?showToast\('This bucket is protected and cannot be deleted\.', 'error'\);/, correctSaveBucket);
fs.writeFileSync('src/pages/buckets.js', code);
console.log('Fixed');
