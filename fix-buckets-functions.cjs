const fs = require('fs');
let code = fs.readFileSync('src/pages/buckets.js', 'utf8');

const injectCode = `
async function loadOrgBuckets() {
  try {
    const { data, error } = await supabaseClient
      .from('buckets')
      .select('*')
      .eq('is_org_level', true)
      .eq('is_deleted', false)
      .order('name');
      
    if (error) throw error;
    
    const list = document.getElementById('orgBucketsList');
    if (!list) return;
    
    if (!data || data.length === 0) {
      list.innerHTML = '<p class="empty-state">No organization-level buckets found.</p>';
      return;
    }
    
    // Also fetch bucket access to show assigned users count
    const { data: accessData } = await supabaseClient
      .from('bucket_access')
      .select('bucket_id, users(name, email, role)');
      
    const accessMap = {};
    if (accessData) {
      accessData.forEach(row => {
        if (!accessMap[row.bucket_id]) accessMap[row.bucket_id] = [];
        accessMap[row.bucket_id].push(row.users);
      });
    }
    
    const role = String(state.user?.role || '').toLowerCase();
    const canManage = ['admin', 'ceo', 'caoh', 'oh'].includes(role);

    list.innerHTML = data.map(b => {
      const users = accessMap[b.id] || [];
      const userText = users.length > 0 
        ? users.map(u => u.name || u.email).join(', ') 
        : 'No users assigned';
        
      return \`
        <div class="bucket-item">
          <div class="bucket-info">
            <span class="bucket-name">🌍 \${escapeHtml(b.name)}</span>
            <span class="bucket-type">(\${escapeHtml(b.currency || 'N/A')})</span>
            <div style="font-size: 0.8em; color: #888; margin-top: 4px;">Assigned to: \${escapeHtml(userText)}</div>
          </div>
          <div class="bucket-balance">
            \${formatMoney(b.balance, b.currency)}
            \${canManage ? \`
              <div style="margin-top: 8px; text-align: right;">
                <button class="sq-btn primary" title="Assign Users" onclick="window.openAssignUsersModal('\${b.id}', '\${escapeHtml(b.name)}')" style="font-size: 0.75em; padding: 4px 8px; height: auto; width: auto; border-radius: 4px;">👤 Assign</button>
              </div>
            \` : ''}
          </div>
        </div>
      \`;
    }).join('');
    
  } catch (err) {
    console.error('Error loading org buckets:', err);
    showToast('Failed to load org buckets.', 'error');
  }
}

window.openOrgBucketModal = function() {
  // We can reuse the existing bucket modal but configure it for org buckets
  const modal = document.getElementById('bucketModal');
  if (!modal) return;
  document.getElementById('bucketId').value = '';
  document.getElementById('bucketName').value = '';
  document.getElementById('bucketCurrency').value = state.currentTeam?.currency || 'USD';
  document.getElementById('bucketType').value = 'bank';
  
  // Custom flag to indicate this is an org bucket creation
  document.getElementById('bucketModal').dataset.isOrg = 'true';
  document.getElementById('bucketModalTitle').textContent = 'Add Org-Level Bucket';
  
  modal.classList.add('active');
};
`;

code += injectCode;
fs.writeFileSync('src/pages/buckets.js', code, 'utf8');
