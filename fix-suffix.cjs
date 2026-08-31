const fs = require('fs');
let code = fs.readFileSync('src/pages/manager-finance.js', 'utf8');

const badPartStart = code.indexOf('window.exportFinanceReportToPDF = function() {');
if (badPartStart !== -1) {
  code = code.substring(0, badPartStart);
}

const goodSuffix = `
window.exportFinanceReportToPDF = function() {
  if (!cachedReconciliationData.length) {
    alert('No data to export.');
    return;
  }
  try {
    const rows = cachedReconciliationData.map(b => [
      b.team_name || 'Global',
      b.budget_name || (b.budget_id ? b.budget_id.substring(0,8) : ''),
      '$' + (b.allocated_amount || 0).toFixed(2),
      '$' + (b.expenses_amount || 0).toFixed(2),
      '$' + (b.unused_funds_returned || 0).toFixed(2),
      '$' + (b.remaining_held_balance || 0).toFixed(2)
    ]);
    const docDefinition = {
      content: [
        { text: 'Global Budget Reconciliation Report', style: 'header' },
        { text: 'Generated on: ' + new Date().toLocaleDateString(), margin: [0,0,0,10] },
        {
          table: {
            headerRows: 1,
            widths: ['auto', '*', 'auto', 'auto', 'auto', 'auto'],
            body: [
              ['Team', 'Budget Plan', 'Allocated', 'Expenses', 'Returned', 'Remaining'],
              ...rows
            ]
          }
        }
      ],
      styles: {
        header: { fontSize: 18, bold: true, margin: [0, 0, 0, 10] }
      }
    };
    pdfMake.createPdf(docDefinition).download('finance_report.pdf');
  } catch(e) {
    console.error(e);
    alert('Failed to generate PDF. Make sure pdfmake is loaded.');
  }
};

window.exportFinanceReportToCSV = function() {
  if (!cachedReconciliationData.length) {
    alert('No data to export.');
    return;
  }
  let csv = 'Team Name,Budget Name,Allocated Amount,Expenses Amount,Funds Returned,Remaining Balance\\n';
  cachedReconciliationData.forEach(b => {
    csv += \`"\${b.team_name || 'Global'}","\${b.budget_name || b.budget_id}",\${b.allocated_amount || 0},\${b.expenses_amount || 0},\${b.unused_funds_returned || 0},\${b.remaining_held_balance || 0}\\n\`;
  });
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.setAttribute('hidden', '');
  a.setAttribute('href', url);
  a.setAttribute('download', 'Global_Finance_Reconciliation.csv');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

window.loadFinanceDashboardData = loadFinanceDashboardData;
// renderFinanceTable bound directly to window above
`;

code += goodSuffix;
fs.writeFileSync('src/pages/manager-finance.js', code, 'utf8');
