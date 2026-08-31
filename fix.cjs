const fs = require('fs');
let content = fs.readFileSync('src/pages/expense-reports.js', 'utf8');
const targetIdx = content.indexOf('async function exportReportToPDF() {');
if (targetIdx !== -1) {
  content = content.substring(0, targetIdx);
  content += `async function exportReportToPDF() {
  if (!lastReportSnapshot) {
    showToast('Generate a report first, then export to PDF.', 'warning');
    return;
  }

  const pdfBtn = document.getElementById('reportPdfBtn');
  const originalText = pdfBtn ? pdfBtn.innerHTML : 'PDF';
  if (pdfBtn) {
    pdfBtn.disabled = true;
    pdfBtn.innerHTML = '<span class="spinner-small" style="display:inline-block;margin-right:6px;"></span>Loading Links...';
  }

  try {
    const resolvedExpenses = await Promise.all(
      (lastReportSnapshot.filteredExpenses || []).map(async (exp) => {
        const keys = [exp.receipt_url].filter(Boolean);
        const childAttachments = (teamAttachments || []).filter(a => a.expense_id === exp.id && !a.is_deleted).map(a => a.file_url);
        const allKeys = [...new Set([...keys, ...childAttachments])];
        if (!allKeys.length) return exp;
        try {
          const resolvedUrls = await Promise.all(allKeys.map(async (key) => {
            if (isExternalReceiptUrl(key)) return key;
            return await resolveReceiptViewUrl(key);
          }));
          return { ...exp, receipts_resolved_urls: resolvedUrls };
        } catch {
          return exp;
        }
      })
    );

    exportExpenseReportToPdf({
      ...lastReportSnapshot,
      filteredExpenses: resolvedExpenses,
      getBucketName,
      getBudgetName
    });
  } catch (err) {
    showToast('Failed to prepare PDF exports', 'error');
  } finally {
    if (pdfBtn) {
      pdfBtn.disabled = false;
      pdfBtn.innerHTML = originalText;
    }
  }
}

async function exportReportToCSV() {
  if (!lastReportSnapshot) {
    showToast('Generate a report first, then export to CSV.', 'warning');
    return;
  }

  try {
    const expenses = lastReportSnapshot.filteredExpenses || [];
    const csvData = expenses.map(exp => {
      const budget = teamBudgets.find(b => b.id === exp.budget_id);
      let catLabel = 'Unknown';
      if (budget) {
        const catObj = (budget.categories || []).find(c => c.id === exp.budget_category_id);
        if (catObj) catLabel = catObj.category || catObj.name;
      }
      return {
        Date: exp.date,
        Item: exp.item,
        Category: catLabel,
        Budget: budget ? budget.name : 'Unknown',
        Source: getBucketName(exp.bucket_id),
        Amount_Local: exp.local_amount,
        Amount_USD: exp.usd_amount,
        Currency: exp.currency,
        Vendor: exp.vendor || '',
        Submitted_By: exp.submitted_by_name || ''
      };
    });

    const csvStr = convertArrayOfObjectsToCSV(csvData);
    downloadCSV('Expense_Report.csv', csvStr);
  } catch (err) {
    showToast('Failed to generate CSV', 'error');
  }
}

window.exportExpenseReportToCSV = exportReportToCSV;
window.exportExpenseReportToPDF = exportReportToPDF;
`;
  fs.writeFileSync('src/pages/expense-reports.js', content, 'utf8');
  console.log('Fixed file.');
} else {
  console.log('Could not find target');
}
