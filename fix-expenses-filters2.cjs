const fs = require('fs');
let code = fs.readFileSync('src/pages/expenses.js', 'utf8');

const regex1 = /<div class="form-group"><label>To<\/label><input type="date" id="expFilterEnd" onchange="window\.refreshExpenseList\(\)"><\/div>[\s\S]*?<\/div>\s*<\/div>\s*<button type="button"/;
const repl1 = `<div class="form-group"><label>To</label><input type="date" id="expFilterEnd" onchange="window.refreshExpenseList()"></div>
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
        <button type="button"`;
code = code.replace(regex1, repl1);

const regex2 = /document\.getElementById\('expFilterEnd'\)\.value = '';/;
const repl2 = `document.getElementById('expFilterEnd').value = '';
  const r = document.getElementById('expFilterReceipt'); if (r) r.value = '';
  const s = document.getElementById('expFilterStatus'); if (s) s.value = '';`;
code = code.replace(regex2, repl2);

const regex3 = /if \(end && e\.date > end\) return false;\s*return true;/;
const repl3 = `if (end && e.date > end) return false;
    
    const receipt = document.getElementById('expFilterReceipt')?.value || '';
    const status = document.getElementById('expFilterStatus')?.value || '';
    
    if (receipt === 'yes' && !e.receipt_url) return false;
    if (receipt === 'no' && e.receipt_url) return false;
    
    if (status === 'reviewed' && !e.is_reviewed) return false;
    if (status === 'pending' && e.is_reviewed) return false;

    return true;`;
code = code.replace(regex3, repl3);

fs.writeFileSync('src/pages/expenses.js', code);
