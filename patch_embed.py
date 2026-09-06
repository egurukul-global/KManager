import sys

file_path = r'C:\Users\dell\Documents\GitHub\KManager-test\src\pages\expense-reports.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add modal HTML for receiptStyle
old_modal = """          <label class="report-section-check"><input type="checkbox" id="rptSec_incomeSummary" checked> Income Summary</label>
          <label class="report-section-check"><input type="checkbox" id="rptSec_incomeDetail" checked> Income Detail</label>
          <label class="report-section-check"><input type="checkbox" id="rptSec_budgetAllocations" checked> Budget Allocations</label>
          <label class="report-section-check"><input type="checkbox" id="rptSec_financialSummary" checked> Financial Summary</label>
        </div>
        <div class="btn-group">"""

new_modal = """          <label class="report-section-check"><input type="checkbox" id="rptSec_incomeSummary" checked> Income Summary</label>
          <label class="report-section-check"><input type="checkbox" id="rptSec_incomeDetail" checked> Income Detail</label>
          <label class="report-section-check"><input type="checkbox" id="rptSec_budgetAllocations" checked> Budget Allocations</label>
          <label class="report-section-check"><input type="checkbox" id="rptSec_financialSummary" checked> Financial Summary</label>
        </div>
        <div style="margin-top: 15px; margin-bottom: 20px;">
          <label style="font-weight:bold;display:block;margin-bottom:8px;">Receipt Attachments (PDF Export Only):</label>
          <label style="display:block; margin-bottom:5px;"><input type="radio" name="rptSec_receiptStyle" value="link" checked> Include as clickable links</label>
          <label style="display:block;"><input type="radio" name="rptSec_receiptStyle" value="embed"> Embed directly in PDF Annexure</label>
        </div>
        <div class="btn-group">"""
content = content.replace(old_modal, new_modal)

# 2. Extract sections
old_sections = """        subcategorySummary: modal.querySelector('#rptSec_subcategorySummary').checked,
        incomeSummary: modal.querySelector('#rptSec_incomeSummary').checked,
        incomeDetail: modal.querySelector('#rptSec_incomeDetail').checked,
        budgetAllocations: modal.querySelector('#rptSec_budgetAllocations').checked,
        financialSummary: modal.querySelector('#rptSec_financialSummary').checked
      };"""

new_sections = """        subcategorySummary: modal.querySelector('#rptSec_subcategorySummary').checked,
        incomeSummary: modal.querySelector('#rptSec_incomeSummary').checked,
        incomeDetail: modal.querySelector('#rptSec_incomeDetail').checked,
        budgetAllocations: modal.querySelector('#rptSec_budgetAllocations').checked,
        financialSummary: modal.querySelector('#rptSec_financialSummary').checked,
        receiptStyle: modal.querySelector('input[name="rptSec_receiptStyle"]:checked').value
      };"""
content = content.replace(old_sections, new_sections)

# 3. Add the helper function to fetch and embed
helpers = """
async function fetchAndEmbedReceipts(resolvedUrls) {
  const images = [];
  for (const url of resolvedUrls) {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      
      if (blob.type === 'application/pdf') {
        const arrayBuffer = await blob.arrayBuffer();
        const base64s = await convertPdfToImages(arrayBuffer);
        images.push(...base64s);
      } else if (blob.type.startsWith('image/')) {
        const reader = new FileReader();
        const base64 = await new Promise(resolve => {
           reader.onloadend = () => resolve(reader.result);
           reader.readAsDataURL(blob);
        });
        images.push(base64);
      }
    } catch (e) {
      console.error('Failed to embed receipt', e);
    }
  }
  return images;
}
"""
content = content + helpers

# 4. Update exportReportToPDF
old_export = """        try {
          const resolvedUrls = await Promise.all(allKeys.map(async (key) => {
            if (isExternalReceiptUrl(key)) return key;
            return await resolveReceiptViewUrl(key);
          }));
          return { ...exp, receipts_resolved_urls: resolvedUrls };
        } catch {
          return exp;
        }"""

new_export = """        try {
          const resolvedUrls = await Promise.all(allKeys.map(async (key) => {
            if (isExternalReceiptUrl(key)) return key;
            return await resolveReceiptViewUrl(key);
          }));
          const resultExp = { ...exp, receipts_resolved_urls: resolvedUrls };
          if (lastReportSnapshot.sections && lastReportSnapshot.sections.receiptStyle === 'embed') {
            resultExp.receipt_images = await fetchAndEmbedReceipts(resolvedUrls);
          }
          return resultExp;
        } catch {
          return exp;
        }"""
content = content.replace(old_export, new_export)

# 5. Update processReportGenerationInBg
old_bg = """        try {
          const resolvedUrls = await Promise.all(allKeys.map(async (key) => {
            if (isExternalReceiptUrl(key)) return key;
            return await resolveReceiptViewUrl(key);
          }));
          return { ...exp, receipts_resolved_urls: resolvedUrls };
        } catch {
          return exp;
        }"""

new_bg = """        try {
          const resolvedUrls = await Promise.all(allKeys.map(async (key) => {
            if (isExternalReceiptUrl(key)) return key;
            return await resolveReceiptViewUrl(key);
          }));
          const resultExp = { ...exp, receipts_resolved_urls: resolvedUrls };
          if (sections && sections.receiptStyle === 'embed') {
            resultExp.receipt_images = await fetchAndEmbedReceipts(resolvedUrls);
          }
          return resultExp;
        } catch {
          return exp;
        }"""
content = content.replace(old_bg, new_bg)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("expense-reports.js embedded receipts patched")
