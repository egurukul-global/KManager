// ==================== EXPENSE REPORT PDF EXPORT ====================
import { showToast } from '../components/toasts.js';
import { getExpenseCategoryLabel } from './expenseHelpers.js';

function getPdfMake() {
  if (typeof window !== 'undefined' && window.pdfMake) return window.pdfMake;
  return null;
}

function categoryStatusLabel(budgeted, actual) {
  const balance = budgeted - actual;
  if (balance < 0) return { text: 'Over Budget', color: '#dc3545' };
  if (actual === 0) return { text: 'No Spend', color: '#6c757d' };
  return { text: 'On Track', color: '#28a745' };
}

/**
 * @param {object} params
 * @param {Array} params.filteredExpenses
 * @param {Array} params.filteredIncome
 * @param {object} params.filters
 * @param {object|null} params.budget
 * @param {Array} params.teamCategories
 * @param {Function} params.getBucketName
 * @param {Function} params.getBudgetName
 */
export function exportExpenseReportToPdf(params) {
  const pdfMake = getPdfMake();
  if (!pdfMake) {
    showToast('PDF library not loaded. Refresh the page and try again.', 'error');
    return;
  }

  const {
    filteredExpenses = [],
    filteredIncome = [],
    filters = {},
    budget = null,
    teamCategories = [],
    getBucketName,
    getBudgetName
  } = params;

  if (!filteredExpenses.length && !filteredIncome.length && !budget) {
    showToast('No report data to export. Generate a report first.', 'warning');
    return;
  }

  const totalUSD = filteredExpenses.reduce((sum, e) => sum + (parseFloat(e.usd_amount) || 0), 0);

  const filterDesc = [];
  if (filters.start) filterDesc.push(`From: ${filters.start}`);
  if (filters.end) filterDesc.push(`To: ${filters.end}`);
  if (budget) filterDesc.push(`Budget: ${budget.name}`);
  if (filters.category) filterDesc.push(`Category: ${filters.category}`);
  if (filters.sourceId && getBucketName) filterDesc.push(`Source: ${getBucketName(filters.sourceId)}`);
  if (filters.currency) filterDesc.push(`Currency: ${filters.currency}`);

  const expenseBody = [
    [
      { text: 'Date', style: 'tableHeader' },
      { text: 'Item', style: 'tableHeader' },
      { text: 'Category', style: 'tableHeader' },
      { text: 'Source', style: 'tableHeader' },
      { text: 'Local Amt', style: 'tableHeader' },
      { text: 'Rate', style: 'tableHeader' },
      { text: 'USD', style: 'tableHeader' }
    ]
  ];

  [...filteredExpenses].sort((a, b) => b.date.localeCompare(a.date)).forEach(exp => {
    expenseBody.push([
      exp.date,
      exp.item || '—',
      getExpenseCategoryLabel(exp, teamCategories),
      getBucketName ? getBucketName(exp.bucket_id) : '—',
      `${(exp.local_amount || 0).toLocaleString()} ${exp.currency || ''}`,
      String(exp.exchange_rate ?? '—'),
      `$${(parseFloat(exp.usd_amount) || 0).toFixed(2)}`
    ]);
  });

  expenseBody.push([
    { text: 'TOTAL', colSpan: 6, alignment: 'right', bold: true },
    {}, {}, {}, {}, {},
    { text: `$${totalUSD.toFixed(2)}`, bold: true }
  ]);

  const docDefinition = {
    info: {
      title: 'One Kailasa - Report',
      author: 'One Kailasa',
      creationDate: new Date()
    },
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: [30, 50, 30, 50],
    header: {
      columns: [
        {
          text: 'One Kailasa - Report',
          alignment: 'left',
          margin: [40, 20, 0, 0],
          fontSize: 14,
          color: '#9A4452',
          bold: true
        },
        {
          text: new Date().toLocaleString(),
          alignment: 'right',
          margin: [0, 20, 40, 0],
          fontSize: 9,
          color: '#666'
        }
      ]
    },
    footer(currentPage, pageCount) {
      return {
        text: `Page ${currentPage} of ${pageCount}`,
        alignment: 'center',
        fontSize: 8,
        color: '#666'
      };
    },
    content: [
      {
        text: filterDesc.join(' | ') || 'All Data',
        fontSize: 9,
        color: '#666',
        margin: [0, 0, 0, 10]
      },
      { text: 'Expense Transactions', style: 'sectionHeader', margin: [0, 10, 0, 5] },
      {
        table: {
          headerRows: 1,
          widths: ['auto', '*', 'auto', 'auto', 'auto', 'auto', 'auto'],
          body: expenseBody
        },
        layout: tableLayout()
      },
      {
        text: `Total Transactions: ${filteredExpenses.length} | Total USD: $${totalUSD.toFixed(2)}`,
        fontSize: 10,
        margin: [0, 5, 0, 15]
      }
    ],
    styles: {
      tableHeader: { bold: true, fontSize: 8, color: '#555', fillColor: '#f8f9fa' },
      sectionHeader: { fontSize: 14, bold: true, color: '#9A4452' },
      incomeHeader: { fontSize: 12, bold: true, color: '#28a745' }
    },
    defaultStyle: { fontSize: 7, font: 'Roboto' }
  };

  if (budget) {
    let catGrandBudgeted = 0;
    let catGrandActual = 0;
    const catBody = [
      [
        { text: 'Category', style: 'tableHeader' },
        { text: 'Budgeted (USD)', style: 'tableHeader' },
        { text: 'Actual (USD)', style: 'tableHeader' },
        { text: 'Balance (USD)', style: 'tableHeader' },
        { text: 'Status', style: 'tableHeader' }
      ]
    ];

    (budget.categories || []).forEach(cat => {
      const catName = cat.category || cat.name;
      const budgetedUSD = parseFloat(cat.usdAmount ?? cat.usd_amount) || 0;
      catGrandBudgeted += budgetedUSD;

      const catExpenses = filteredExpenses.filter(
        e => getExpenseCategoryLabel(e, teamCategories) === catName
      );
      const actualUSD = catExpenses.reduce((sum, e) => sum + (parseFloat(e.usd_amount) || 0), 0);
      catGrandActual += actualUSD;

      const balanceUSD = budgetedUSD - actualUSD;
      const status = categoryStatusLabel(budgetedUSD, actualUSD);

      catBody.push([
        catName + (cat.subcategory ? ` / ${cat.subcategory}` : ''),
        `$${budgetedUSD.toFixed(2)}`,
        `$${actualUSD.toFixed(2)}`,
        {
          text: `$${balanceUSD.toFixed(2)}`,
          color: balanceUSD < 0 ? '#dc3545' : '#28a745',
          bold: true
        },
        { text: status.text, color: status.color, bold: true }
      ]);
    });

    const catGrandBalance = catGrandBudgeted - catGrandActual;
    const grandStatus = categoryStatusLabel(catGrandBudgeted, catGrandActual);
    catBody.push([
      { text: 'TOTAL', bold: true },
      { text: `$${catGrandBudgeted.toFixed(2)}`, bold: true },
      { text: `$${catGrandActual.toFixed(2)}`, bold: true },
      {
        text: `$${catGrandBalance.toFixed(2)}`,
        color: catGrandBalance < 0 ? '#dc3545' : '#28a745',
        bold: true
      },
      { text: grandStatus.text, color: grandStatus.color, bold: true }
    ]);

    docDefinition.content.push(
      { text: 'Category Performance', style: 'sectionHeader', margin: [0, 15, 0, 5] },
      {
        table: {
          headerRows: 1,
          widths: ['*', 'auto', 'auto', 'auto', 'auto'],
          body: catBody
        },
        layout: tableLayout()
      }
    );
  }

  if (filteredIncome.length > 0) {
    const totalIncomeAmount = filteredIncome.reduce(
      (sum, f) => sum + (parseFloat(f.amount_usd) || 0),
      0
    );
    const totalIncomeAllocated = filteredIncome.reduce((sum, f) => {
      return sum + (f.budget_allocations || []).reduce(
        (s, a) => s + (parseFloat(a.amount_usd) || 0),
        0
      );
    }, 0);
    const totalIncomeUnallocated = totalIncomeAmount - totalIncomeAllocated;

    docDefinition.content.push(
      { text: 'Income Summary', style: 'incomeHeader', margin: [0, 20, 0, 5] },
      {
        table: {
          headerRows: 1,
          widths: ['auto', 'auto'],
          body: [
            [
              { text: 'Metric', style: 'tableHeader' },
              { text: 'Value', style: 'tableHeader' }
            ],
            ['Total Records', String(filteredIncome.length)],
            ['Total Received', `$${totalIncomeAmount.toFixed(2)}`],
            ['Allocated', `$${totalIncomeAllocated.toFixed(2)}`],
            ['Unallocated', `$${totalIncomeUnallocated.toFixed(2)}`]
          ]
        },
        layout: tableLayout()
      },
      { text: 'Income Details', style: 'incomeHeader', margin: [0, 15, 0, 5] }
    );

    const incomeBody = [
      [
        { text: 'Date', style: 'tableHeader' },
        { text: 'From', style: 'tableHeader' },
        { text: 'Bucket', style: 'tableHeader' },
        { text: 'Amount (Local)', style: 'tableHeader' },
        { text: 'Amount (USD)', style: 'tableHeader' },
        { text: 'Description', style: 'tableHeader' }
      ]
    ];

    [...filteredIncome].sort((a, b) => b.date.localeCompare(a.date)).forEach(fund => {
      const localDisplay = fund.exchange_rate
        ? `${(fund.local_amount || 0).toLocaleString()} ${fund.currency || ''} @ ${fund.exchange_rate}`
        : `${(fund.local_amount || 0).toLocaleString()} ${fund.currency || ''}`;
      incomeBody.push([
        fund.date,
        fund.payment_from || '—',
        getBucketName ? getBucketName(fund.bucket_id) : '—',
        localDisplay,
        `$${(parseFloat(fund.amount_usd) || 0).toFixed(2)}`,
        fund.description || '—'
      ]);
    });

    docDefinition.content.push({
      table: {
        headerRows: 1,
        widths: ['auto', 'auto', 'auto', 'auto', 'auto', '*'],
        body: incomeBody
      },
      layout: tableLayout(),
      margin: [0, 0, 0, 10]
    });

    const allocationBody = [
      [
        { text: 'Date', style: 'tableHeader' },
        { text: 'From', style: 'tableHeader' },
        { text: 'Budget', style: 'tableHeader' },
        { text: 'Amount (USD)', style: 'tableHeader' },
        { text: 'Source Income', style: 'tableHeader' }
      ]
    ];

    filteredIncome.forEach(fund => {
      (fund.budget_allocations || []).forEach(alloc => {
        allocationBody.push([
          fund.date,
          fund.payment_from || '—',
          getBudgetName ? getBudgetName(alloc.budget_id) : 'Unknown',
          `$${(parseFloat(alloc.amount_usd) || 0).toFixed(2)}`,
          fund.description || '—'
        ]);
      });
    });

    docDefinition.content.push(
      { text: 'Budget Allocations', style: 'incomeHeader', margin: [0, 15, 0, 5] }
    );

    if (allocationBody.length > 1) {
      docDefinition.content.push({
        table: {
          headerRows: 1,
          widths: ['auto', 'auto', '*', 'auto', '*'],
          body: allocationBody
        },
        layout: tableLayout(),
        margin: [0, 0, 0, 10]
      });
    } else {
      docDefinition.content.push({
        text: 'No allocations found for the selected period.',
        fontSize: 9,
        color: '#666',
        margin: [0, 5, 0, 10]
      });
    }
  }

  const dateStr = new Date().toISOString().split('T')[0];
  pdfMake.createPdf(docDefinition).download(`finance_report_${dateStr}.pdf`);
  showToast(`Report downloaded: finance_report_${dateStr}.pdf`, 'success');
}

function tableLayout() {
  return {
    fillColor(rowIndex) {
      return rowIndex === 0 ? '#f8f9fa' : null;
    },
    hLineColor() {
      return '#e9ecef';
    },
    vLineColor() {
      return '#e9ecef';
    },
    paddingLeft() {
      return 4;
    },
    paddingRight() {
      return 4;
    },
    paddingTop() {
      return 3;
    },
    paddingBottom() {
      return 3;
    }
  };
}
