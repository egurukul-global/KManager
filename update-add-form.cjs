const fs = require('fs');
let code = fs.readFileSync('src/pages/expenses.js', 'utf8');

const regex = /<form id="addExpenseForm"[\s\S]*?<div id="expReceiptPreview" style="margin-top:8px;"><\/div>\s*<\/div>/;
const replacement = `<form id="addExpenseForm" onsubmit="window.handleAddExpenseSubmit(event)">
          <div class="form-stack">
            <div class="form-grid-row form-grid-row--expense-header">
              <div class="form-group"><label class="required">Date</label><input type="date" name="date" id="expDate" required></div>
              <div class="form-group"><label class="required">Budget</label><select name="budget_id" id="expBudget" required onchange="window.onExpenseBudgetChange()"></select></div>
              <div class="form-group"><label class="required">Category</label><select id="expCategory" name="category" required></select></div>
              <div class="form-group"><label class="required">Bucket</label><select id="expBucket" name="bucket_id" required onchange="window.onExpenseBucketChange()"></select></div>
            </div>
            <div class="form-grid-row form-grid-row--expense-chunk">
              <div class="form-group"><label class="required">Item</label><input type="text" name="item" id="expItem" required maxlength="20"></div>
              <div class="form-group"><label class="required">Local amount</label><input type="number" class="input-amount" name="local_amount" id="expLocalAmount" step="0.01" required oninput="window.onExpenseMathChange()"></div>
              <div class="form-group"><label class="required">Currency</label><select id="expCurrency" name="currency" required onchange="window.onExpenseCurrencyChange()"></select></div>
            </div>
            <div class="form-grid-row form-grid-row--expense-money">
              <div class="form-group"><label>Rate</label><select id="expRateSelect" name="rate_select" onchange="window.onExpenseMathChange()"></select></div>
              <div class="form-group"><label>Manual</label><input type="number" class="input-rate" id="expRateManual" name="rate_manual" step="any" oninput="window.onExpenseMathChange()"></div>
              <div class="form-group"><label>USD</label><input type="number" class="input-amount" id="expUSD" readonly></div>
            </div>
            <div class="form-group form-span-full">
              <label>Receipt</label>
              <input type="text" id="expReceiptUrl" name="receipt_url" placeholder="Paste URL, or scan / upload (stores file key)" oninput="window.checkReceiptForReview('add')">
              <div class="btn-group" style="margin-top:8px;flex-wrap:wrap;">
                <button type="button" class="secondary" id="expReceiptCameraBtn">Scan with camera</button>
                <button type="button" class="secondary" id="expReceiptFileBtn">Choose file</button>
                <input type="file" id="expReceiptFileInput" accept="image/*,application/pdf" multiple style="display:none">
              </div>
              <p class="form-hint" id="expReceiptHint" style="margin-top:6px;"></p>
              <div id="expReceiptPreview" style="margin-top:8px;"></div>
            </div>
            <div class="form-group form-span-full" style="background:var(--bg-secondary); padding:15px; border-radius:6px; border:1px solid var(--border);">
              <label style="display:flex; align-items:center; gap:8px; margin:0; cursor:pointer;">
                <input type="checkbox" id="expSubmitReview" name="is_submitted" style="width:18px; height:18px; cursor:pointer;" disabled>
                <strong style="color:var(--primary);">Submit for Finance Review</strong>
              </label>
              <p class="form-hint" id="expSubmitHint" style="margin-top:6px; margin-bottom:0; font-size:0.85em; color:var(--error);">A receipt must be attached to submit for review.</p>
            </div>`;

code = code.replace(regex, replacement);
fs.writeFileSync('src/pages/expenses.js', code);
