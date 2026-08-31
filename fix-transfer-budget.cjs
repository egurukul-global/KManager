const fs = require('fs');
let code = fs.readFileSync('src/pages/transfer.js', 'utf8');

const htmlOld = `<div class="form-grid-row form-grid-row--transfer-buckets">
            <div class="form-group"><label>Transfer Date</label><input type="date" id="trDate" required></div>
            <div class="form-group"><label>Source Bucket</label><select id="trSourceBucketId" required onchange="window.onTransferBucketChange()"><option value="">Loading…</option></select><span class="form-field-hint" id="trSourceCurrency">Currency: —</span></div>
            <div class="form-group"><label>Destination Bucket</label><select id="trDestBucketId" required onchange="window.onTransferBucketChange()"><option value="">Loading…</option></select><span class="form-field-hint" id="trDestCurrency">Currency: —</span></div>
          </div>`;

const htmlNew = `<div class="form-grid-row form-grid-row--transfer-buckets">
            <div class="form-group"><label>Transfer Date</label><input type="date" id="trDate" required></div>
            <div class="form-group"><label>Source Bucket</label><select id="trSourceBucketId" required onchange="window.onTransferBucketChange()"><option value="">Loading…</option></select><span class="form-field-hint" id="trSourceCurrency">Currency: —</span></div>
            <div class="form-group"><label>Destination Bucket</label><select id="trDestBucketId" required onchange="window.onTransferBucketChange()"><option value="">Loading…</option></select><span class="form-field-hint" id="trDestCurrency">Currency: —</span></div>
          </div>
          <div class="form-grid-row form-grid-row--transfer-budget" id="trLinkedBudgetRow" style="display:none;">
            <div class="form-group">
              <label>Link to Budget Plan <span class="form-hint">(For Funding / Reconciliation)</span></label>
              <select id="trLinkedBudgetId"><option value="">Select budget plan...</option></select>
            </div>
          </div>`;

code = code.replace(htmlOld, htmlNew);

// Add the logic to populate and show/hide the budget select
const oldFunc = `  if (destBucket) {
    destCurrencyEl.textContent = \`Currency: \${destBucket.currency}\`;
    if (convertedCurrencyLabel) convertedCurrencyLabel.textContent = \`(\${destBucket.currency})\`;
  } else {
    destCurrencyEl.textContent = 'Currency: —';
    if (convertedCurrencyLabel) convertedCurrencyLabel.textContent = '';
  }`;

const newFunc = `  if (destBucket) {
    destCurrencyEl.textContent = \`Currency: \${destBucket.currency}\`;
    if (convertedCurrencyLabel) convertedCurrencyLabel.textContent = \`(\${destBucket.currency})\`;
  } else {
    destCurrencyEl.textContent = 'Currency: —';
    if (convertedCurrencyLabel) convertedCurrencyLabel.textContent = '';
  }
  
  // Show linked budget dropdown if source is Org/System and dest is Team
  const budgetRow = document.getElementById('trLinkedBudgetRow');
  if (budgetRow) {
    if (srcBucket && (srcBucket.is_org_level || srcBucket.is_system_bucket) && destBucket && !destBucket.is_org_level) {
      budgetRow.style.display = '';
      populateLinkedBudgetSelect(destBucket.team_id);
    } else {
      budgetRow.style.display = 'none';
      const sel = document.getElementById('trLinkedBudgetId');
      if (sel) sel.innerHTML = '<option value="">Select budget plan...</option>';
    }
  }`;

code = code.replace(oldFunc, newFunc);

const addFunc = `
async function populateLinkedBudgetSelect(teamId) {
  const sel = document.getElementById('trLinkedBudgetId');
  if (!sel) return;
  sel.innerHTML = '<option value="">Loading...</option>';
  
  const { data, error } = await window.supabaseClient
    .from('budget_plans')
    .select('id, name, total_amount')
    .eq('team_id', teamId)
    .eq('is_deleted', false);
    
  if (error || !data || data.length === 0) {
    sel.innerHTML = '<option value="">No budgets found</option>';
    return;
  }
  
  sel.innerHTML = '<option value="">Select budget plan...</option>';
  data.forEach(b => {
    sel.innerHTML += \`<option value="\${b.id}">\${escapeHtml(b.name)} (\$\${b.total_amount})</option>\`;
  });
}
`;

code += addFunc;

fs.writeFileSync('src/pages/transfer.js', code, 'utf8');
console.log('Fixed transfer.js to add linked budget');
