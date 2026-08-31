const fs = require('fs');
let code = fs.readFileSync('src/pages/expense-reports.js', 'utf8');

const targetStr = `if (log.status === 'completed' && log.pdf_url) {
        actionHtml = '<button type="button" class="btn-sm" onclick="window.downloadReportPdf(\\'' + log.id + '\\')">Download PDF</button>';
      }`;

const replacementStr = `if (log.status === 'completed' && log.pdf_url) {
        actionHtml = '<div style="display:flex; gap: 5px;"><button type="button" class="btn-sm" onclick="window.downloadReportPdf(\\'' + log.id + '\\')">PDF</button><button type="button" class="btn-sm secondary" onclick="window.downloadReportCsv(\\'' + log.id + '\\')">CSV</button></div>';
      }`;

code = code.replace(targetStr, replacementStr);

const csvFunc = `
export async function downloadReportCsv(logId) {
  try {
    const { data, error } = await sbSelect('report_logs', { eq: { id: logId } });
    const log = data?.[0];
    if (!log || !log.filters) return showToast('Log or filters not found', 'error');
    
    // We can filter the expenses again using the saved filters
    const resolvedExpenses = filterExpenses(log.filters);
    
    if (!resolvedExpenses.length) return showToast('No expenses found for this report criteria.', 'warning');
    
    const csvData = resolvedExpenses.map(exp => {
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
    downloadCSV(\`Expense_Report_\${logId.substring(0,8)}.csv\`, csvStr);
  } catch (err) {
    showToast('Failed to generate CSV', 'error');
  }
}
window.downloadReportCsv = downloadReportCsv;
`;

code += csvFunc;
fs.writeFileSync('src/pages/expense-reports.js', code, 'utf8');
console.log('Added CSV download button to logs');
