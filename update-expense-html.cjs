const fs = require('fs');
let code = fs.readFileSync('src/pages/expenses.js', 'utf8');

const htmlRegex = /<div id="editExpReceiptPreview" style="margin-top:8px;"><\/div>\s*<\/div>/;
const replacement = `<div id="editExpReceiptPreview" style="margin-top:8px;"></div>
            </div>
            <div id="editExpCorrectionAlert" style="display:none; padding:10px; background:var(--error-light, #ffebee); color:var(--error); border-left:4px solid var(--error); border-radius:4px; margin-bottom:15px;">
              <strong>Finance Notes:</strong> <span id="editExpCorrectionNotes"></span>
            </div>
            <div class="form-group form-span-full" style="background:var(--bg-secondary); padding:15px; border-radius:6px; border:1px solid var(--border);">
              <label style="display:flex; align-items:center; gap:8px; margin:0; cursor:pointer;">
                <input type="checkbox" id="editExpSubmitReview" name="is_submitted" style="width:18px; height:18px; cursor:pointer;" checked>
                <strong style="color:var(--primary);">Submit for Finance Review</strong>
              </label>
              <p class="form-hint" id="editExpSubmitHint" style="margin-top:6px; margin-bottom:0; font-size:0.85em; color:var(--error);">A receipt must be attached to submit for review.</p>
            </div>`;

code = code.replace(htmlRegex, replacement);
fs.writeFileSync('src/pages/expenses.js', code);
