const fs = require('fs');
let code = fs.readFileSync('src/pages/expenses.js', 'utf8');

// 1. Add HTML Filters
const oldFilterHtml = `          <div class="form-group">
            <label>Bucket</label>
            <select id="expFilterBucket" onchange="window.refreshExpenseList()">
              <option value="">All Buckets</option>
            </select>
          </div>
        </div>
      </div>
      
      <div class="table-container show-desktop">`;

const newFilterHtml = `          <div class="form-group">
            <label>Bucket</label>
            <select id="expFilterBucket" onchange="window.refreshExpenseList()">
              <option value="">All Buckets</option>
            </select>
          </div>
          <div class="form-group">
            <label>Receipt</label>
            <select id="expFilterReceipt" onchange="window.refreshExpenseList()">
              <option value="">All</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
          <div class="form-group">
            <label>Status</label>
            <select id="expFilterStatus" onchange="window.refreshExpenseList()">
              <option value="">All</option>
              <option value="reviewed">Reviewed</option>
              <option value="pending">Pending</option>
            </select>
          </div>
        </div>
      </div>
      
      <div class="table-container show-desktop">`;
code = code.replace(oldFilterHtml, newFilterHtml);

// 2. Add Filter Logic
const oldFilterLogic = `  const start = document.getElementById('expFilterStart')?.value;
  const end = document.getElementById('expFilterEnd')?.value;

  return teamExpensesCache.filter(e => {`;

const newFilterLogic = `  const start = document.getElementById('expFilterStart')?.value;
  const end = document.getElementById('expFilterEnd')?.value;
  const receipt = document.getElementById('expFilterReceipt')?.value;
  const status = document.getElementById('expFilterStatus')?.value;

  return teamExpensesCache.filter(e => {
    if (status === 'reviewed' && !e.is_reviewed) return false;
    if (status === 'pending' && e.is_reviewed) return false;
    const hasAtt = e.receipt_url || (window.teamAttachmentsCache || []).some(a => a.expense_id === e.id && !a.is_deleted);
    if (receipt === 'yes' && !hasAtt) return false;
    if (receipt === 'no' && hasAtt) return false;`;

code = code.replace(oldFilterLogic, newFilterLogic);

// 3. Reset Filters
const oldReset = `  document.getElementById('expFilterStart').value = '';
  document.getElementById('expFilterEnd').value = '';`;
const newReset = `  document.getElementById('expFilterStart').value = '';
  document.getElementById('expFilterEnd').value = '';
  if(document.getElementById('expFilterReceipt')) document.getElementById('expFilterReceipt').value = '';
  if(document.getElementById('expFilterStatus')) document.getElementById('expFilterStatus').value = '';`;
code = code.replace(oldReset, newReset);

fs.writeFileSync('src/pages/expenses.js', code);
