const fs = require('fs');
let code = fs.readFileSync('src/pages/expense-reports.js', 'utf8');

const targetStr = `export async function processReportGenerationInBg(logId, filters, sections) {
  try {
    // Basic mock implementation for now since it was truncated.
    // We just wait 2 seconds and mark it as completed.
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await sbUpdate('report_logs', logId, { 
      status: 'completed', 
      pdf_url: '#', // We would normally upload the generated PDF blob here
      updated_at: new Date().toISOString()
    });
    
    showToast('Report generation completed', 'success');
    refreshReportLogs();
  } catch (err) {
    await sbUpdate('report_logs', logId, { status: 'failed', updated_at: new Date().toISOString() });
    refreshReportLogs();
  }
}`;

const replacementStr = `export async function processReportGenerationInBg(logId, filters, sections) {
  try {
    const resolvedExpenses = filterExpenses(filters);
    const budget = teamBudgets.find(b => b.id === filters.budgetId);
    
    const snapshot = {
      filters,
      budget,
      sections,
      filteredExpenses: resolvedExpenses
    };
    
    // Resolve receipts for PDF
    const resolvedWithReceipts = await Promise.all(
      resolvedExpenses.map(async (exp) => {
        const keys = [exp.receipt_url].filter(Boolean);
        const childAttachments = (typeof teamAttachments !== 'undefined' ? teamAttachments : []).filter(a => a.expense_id === exp.id && !a.is_deleted).map(a => a.file_url);
        const allKeys = [...new Set([...keys, ...childAttachments])];
        if (!allKeys.length) return exp;
        try {
          const resolvedUrls = await Promise.all(allKeys.map(async (key) => {
            if (isExternalReceiptUrl(key)) return key;
            return await resolveReceiptViewUrl(key);
          }));
          return { ...exp, receipt_url: resolvedUrls[0], _allReceipts: resolvedUrls };
        } catch (e) {
          return exp;
        }
      })
    );
    snapshot.filteredExpenses = resolvedWithReceipts;
    
    const docDefinition = await buildReportPdfDefinition({
      teamName: getReportTeamName(),
      filtersDescription: buildReportFilterDescription(filters, budget, getBucketName),
      snapshot: snapshot
    });
    
    const pdfDocGenerator = window.pdfMake.createPdf(docDefinition);
    pdfDocGenerator.getBlob(async (blob) => {
      try {
        const filename = \`Expense_Report_\${logId.substring(0,8)}.pdf\`;
        const pdf_url = await uploadReportPdf(blob, filename);
        
        await sbUpdate('report_logs', logId, {
          status: 'completed',
          pdf_url: pdf_url,
          updated_at: new Date().toISOString()
        });
        refreshReportLogs();
      } catch (err) {
        console.error('Blob upload error:', err);
        await sbUpdate('report_logs', logId, { status: 'failed', updated_at: new Date().toISOString() });
        refreshReportLogs();
      }
    });

  } catch (err) {
    console.error('process bg error:', err);
    await sbUpdate('report_logs', logId, { status: 'failed', updated_at: new Date().toISOString() });
    refreshReportLogs();
  }
}`;

if (code.includes(targetStr)) {
  code = code.replace(targetStr, replacementStr);
  fs.writeFileSync('src/pages/expense-reports.js', code, 'utf8');
  console.log('Replaced processReportGenerationInBg');
} else {
  console.log('Target mock function not found');
}
