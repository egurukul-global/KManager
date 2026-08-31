const fs = require('fs');
let code = fs.readFileSync('src/pages/expenses.js', 'utf8');

const oldHtml = `<div class="form-group"><label>To</label><input type="date" id="expFilterEnd" onchange="window.refreshExpenseList()"></div>
        </div>
      </div>
      <button type="button" class="secondary" style="margin-top:12px;" onclick="window.resetExpenseFilters()">Reset filters</button>
    </div>`;

const newHtml = `<div class="form-group"><label>To</label><input type="date" id="expFilterEnd" onchange="window.refreshExpenseList()"></div>
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
      <button type="button" class="secondary" style="margin-top:12px;" onclick="window.resetExpenseFilters()">Reset filters</button>
    </div>`;

code = code.replace(oldHtml, newHtml);

const oldReset = `document.getElementById('expFilterStart').value = '';
  document.getElementById('expFilterEnd').value = '';`;
const newReset = `document.getElementById('expFilterStart').value = '';
  document.getElementById('expFilterEnd').value = '';
  const r = document.getElementById('expFilterReceipt'); if (r) r.value = '';
  const s = document.getElementById('expFilterStatus'); if (s) s.value = '';`;
code = code.replace(oldReset, newReset);

const oldFilter = `if (end && e.date > end) return false;
    return true;`;
const newFilter = `if (end && e.date > end) return false;
    
    const receipt = document.getElementById('expFilterReceipt')?.value || '';
    const status = document.getElementById('expFilterStatus')?.value || '';
    
    if (receipt === 'yes' && !e.receipt_url) return false;
    if (receipt === 'no' && e.receipt_url) return false;
    
    if (status === 'reviewed' && !e.is_reviewed) return false;
    if (status === 'pending' && e.is_reviewed) return false;

    return true;`;
code = code.replace(oldFilter, newFilter);

fs.writeFileSync('src/pages/expenses.js', code);
