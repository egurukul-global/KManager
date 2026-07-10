// ==================== EXPENSE REPORT PDF EXPORT ====================
import { showToast } from '../components/toasts.js';
import { getExpenseCategoryLabel } from './expenseHelpers.js';
import {
  truncReportItem,
  buildReportFilterDescription,
  budgetedUsd,
  aggregateSpendByCategory
} from './reportHelpers.js';

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

/**
 * @param {object} params
 */
export function exportExpenseReportToPdf(params) {
  const pdfMake = getPdfMake();
  if (!pdfMake) {
    showToast('PDF library not loaded. Refresh the page and try again.', 'error');
    return;
  }

  const {
    filteredExpenses = [],
    incomeScope = { records: [], summary: null },
    filters = {},
    budget = null,
    teamCategories = [],
    teamBuckets = [],
    sections = {},
    teamName = 'Current Team',
    getBucketName,
    getBudgetName,
    teamBudgets = []
  } = params;

  const filteredIncome = incomeScope.records || [];
  const incomeSummary = incomeScope.summary;

  const hasContent = filteredExpenses.length || filteredIncome.length
    || teamBuckets.length || budget;
  if (!hasContent) {
    showToast('No report data to export. Generate a report first.', 'warning');
    return;
  }

  const reportTitle = `One Kailasa Report for ${teamName}`;
  const filterParts = buildReportFilterDescription(filters, budget, getBucketName);
  const content = [];

  if (filterParts.length) {
    content.push({
      text: filterParts.join(' | '),
      fontSize: 9,
      color: '#666',
      margin: [0, 0, 0, 10]
    });
  }

  if (sections.expenseDetail) {
    const totalUSD = filteredExpenses.reduce(
      (sum, e) => sum + (parseFloat(e.usd_amount) || 0),
      0
    );
    const expenseBody = [
      [
        { text: 'Date', style: 'tableHeader' },
        { text: 'Item', style: 'tableHeader' },
        { text: 'Category', style: 'tableHeader' },
        { text: 'Source', style: 'tableHeader' },
        { text: 'Local', style: 'tableHeader' },
        { text: 'Rate', style: 'tableHeader' },
        { text: 'USD', style: 'tableHeader' }
      ]
    ];

    [...filteredExpenses].sort((a, b) => b.date.localeCompare(a.date)).forEach(exp => {
      expenseBody.push([
        exp.date,
        truncReportItem(exp.item),
        getExpenseCategoryLabel(exp, teamCategories),
        getBucketName ? getBucketName(exp.bucket_id) : '—',
        `${(exp.local_amount || 0).toLocaleString()} ${exp.currency || ''}`,
        String(exp.exchange_rate ?? '—'),
        `$${(parseFloat(exp.usd_amount) || 0).toFixed(2)}`
      ]);
    });

    if (expenseBody.length > 1) {
      expenseBody.push([
        { text: 'TOTAL', colSpan: 6, alignment: 'right', bold: true },
        {}, {}, {}, {}, {},
        { text: `$${totalUSD.toFixed(2)}`, bold: true }
      ]);
    }

    content.push(
      { text: 'Expense Details', style: 'sectionHeader', margin: [0, 10, 0, 5] },
      {
        table: {
          headerRows: 1,
          widths: ['auto', 50, 'auto', 'auto', 'auto', 'auto', 'auto'],
          body: expenseBody
        },
        layout: tableLayout()
      },
      {
        text: `Transactions: ${filteredExpenses.length} | Total USD: $${totalUSD.toFixed(2)}`,
        fontSize: 10,
        margin: [0, 5, 0, 12]
      }
    );
  }

  if (sections.categorySummary) {
    if (budget) {
      content.push(...buildPdfCategoryPerformance(filteredExpenses, budget, teamCategories));
    } else {
      content.push(...buildPdfBudgetVsActual(filteredExpenses, teamBudgets, filters));
      const byCat = aggregateSpendByCategory(filteredExpenses, teamCategories);
      if (byCat.length) {
        const catBody = [
          [
            { text: 'Category', style: 'tableHeader' },
            { text: 'Transactions', style: 'tableHeader' },
            { text: 'Actual (USD)', style: 'tableHeader' }
          ]
        ];
        let total = 0;
        byCat.forEach(row => {
          total += row.actual;
          catBody.push([row.category, String(row.count), `$${row.actual.toFixed(2)}`]);
        });
        catBody.push([
          { text: 'TOTAL', bold: true },
          { text: String(filteredExpenses.length), bold: true },
          { text: `$${total.toFixed(2)}`, bold: true }
        ]);
        content.push(
          { text: 'Spending by Category', style: 'sectionHeader', margin: [0, 15, 0, 5] },
          {
            table: { headerRows: 1, widths: ['*', 'auto', 'auto'], body: catBody },
            layout: tableLayout()
          }
        );
      }
    }
  }

  if (sections.incomeSummary && incomeSummary && incomeSummary.recordCount > 0) {
    const rows = incomeSummary.budgetScoped
      ? [
          ['Allocation Records', String(incomeSummary.recordCount)],
          ['Allocated to Budget', `$${incomeSummary.allocated.toFixed(2)}`]
        ]
      : [
          ['Total Records', String(incomeSummary.recordCount)],
          ['Total Received', `$${incomeSummary.totalReceived.toFixed(2)}`],
          ['Allocated', `$${incomeSummary.allocated.toFixed(2)}`],
          ['Unallocated', `$${incomeSummary.unallocated.toFixed(2)}`]
        ];
    content.push(
      { text: 'Income Summary', style: 'incomeHeader', margin: [0, 15, 0, 5] },
      {
        table: {
          headerRows: 1,
          widths: ['auto', 'auto'],
          body: [
            [{ text: 'Metric', style: 'tableHeader' }, { text: 'Value', style: 'tableHeader' }],
            ...rows
          ]
        },
        layout: tableLayout()
      }
    );
  }

  if (sections.incomeDetail && filteredIncome.length) {
    const incomeBody = [
      [
        { text: 'Date', style: 'tableHeader' },
        { text: 'From', style: 'tableHeader' },
        { text: 'Bucket', style: 'tableHeader' },
        { text: 'Local', style: 'tableHeader' },
        { text: 'USD', style: 'tableHeader' },
        { text: 'Description', style: 'tableHeader' }
      ]
    ];

    [...filteredIncome].sort((a, b) => b.date.localeCompare(a.date)).forEach(fund => {
      const allocs = fund.budget_allocations || [];
      if (!allocs.length) {
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
        return;
      }
      allocs.forEach(alloc => {
        const allocUsd = parseFloat(alloc.amount_usd) || 0;
        const fundUsd = parseFloat(fund.amount_usd) || 0;
        const allocLocal = fundUsd > 0
          ? (allocUsd / fundUsd) * (fund.local_amount || 0)
          : 0;
        incomeBody.push([
          fund.date,
          fund.payment_from || '—',
          getBucketName ? getBucketName(fund.bucket_id) : '—',
          `${allocLocal.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${fund.currency || ''}`,
          `$${allocUsd.toFixed(2)}`,
          `${fund.description || '—'} → ${getBudgetName ? getBudgetName(alloc.budget_id) : 'Budget'}`
        ]);
      });
    });

    content.push(
      { text: 'Income Details', style: 'incomeHeader', margin: [0, 15, 0, 5] },
      {
        table: {
          headerRows: 1,
          widths: ['auto', 'auto', 'auto', 'auto', 'auto', '*'],
          body: incomeBody
        },
        layout: tableLayout(),
        margin: [0, 0, 0, 10]
      }
    );
  }

  if (sections.budgetAllocations && filteredIncome.length) {
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

    content.push({ text: 'Budget Allocations', style: 'incomeHeader', margin: [0, 15, 0, 5] });
    if (allocationBody.length > 1) {
      content.push({
        table: {
          headerRows: 1,
          widths: ['auto', 'auto', '*', 'auto', '*'],
          body: allocationBody
        },
        layout: tableLayout(),
        margin: [0, 0, 0, 10]
      });
    } else {
      content.push({
        text: 'No allocations for the selected criteria.',
        fontSize: 9,
        color: '#666',
        margin: [0, 5, 0, 10]
      });
    }
  }

  if (sections.financialSummary && teamBuckets.length) {
    const finBody = [
      [
        { text: 'Bucket', style: 'tableHeader' },
        { text: 'Currency', style: 'tableHeader' },
        { text: 'Balance', style: 'tableHeader' }
      ]
    ];
    teamBuckets.forEach(b => {
      finBody.push([
        b.name,
        b.currency || '—',
        `${(parseFloat(b.balance) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
      ]);
    });
    content.push(
      { text: 'Financial Summary — Bucket Balances', style: 'sectionHeader', margin: [0, 15, 0, 5] },
      {
        table: { headerRows: 1, widths: ['*', 'auto', 'auto'], body: finBody },
        layout: tableLayout()
      }
    );
  }

  if (!content.length) {
    showToast('No sections selected or no data to export.', 'warning');
    return;
  }

  const docDefinition = {
    info: { title: reportTitle, author: 'One Kailasa', creationDate: new Date() },
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: [30, 50, 30, 50],
    header: {
      columns: [
        {
          text: reportTitle,
          alignment: 'left',
          margin: [40, 20, 0, 0],
          fontSize: 12,
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
    content,
    styles: {
      tableHeader: { bold: true, fontSize: 8, color: '#555', fillColor: '#f8f9fa' },
      sectionHeader: { fontSize: 14, bold: true, color: '#9A4452' },
      incomeHeader: { fontSize: 12, bold: true, color: '#28a745' }
    },
    defaultStyle: { fontSize: 7, font: 'Roboto' }
  };

  const dateStr = new Date().toISOString().split('T')[0];
  pdfMake.createPdf(docDefinition).download(`finance_report_${dateStr}.pdf`);
  showToast(`Report downloaded: finance_report_${dateStr}.pdf`, 'success');
}

function buildPdfCategoryPerformance(filteredExpenses, budget, teamCategories) {
  let catGrandBudgeted = 0;
  let catGrandActual = 0;
  const catBody = [
    [
      { text: 'Category', style: 'tableHeader' },
      { text: 'Budgeted', style: 'tableHeader' },
      { text: 'Actual', style: 'tableHeader' },
      { text: 'Balance', style: 'tableHeader' },
      { text: 'Status', style: 'tableHeader' }
    ]
  ];

  (budget.categories || []).forEach(cat => {
    const catName = cat.category || cat.name;
    const budgetedUSD = parseFloat(cat.usdAmount ?? cat.usd_amount) || 0;
    catGrandBudgeted += budgetedUSD;
    const actualUSD = filteredExpenses
      .filter(e => getExpenseCategoryLabel(e, teamCategories) === catName)
      .reduce((sum, e) => sum + (parseFloat(e.usd_amount) || 0), 0);
    catGrandActual += actualUSD;
    const balanceUSD = budgetedUSD - actualUSD;
    const status = categoryStatusLabel(budgetedUSD, actualUSD);
    catBody.push([
      catName + (cat.subcategory ? ` / ${cat.subcategory}` : ''),
      `$${budgetedUSD.toFixed(2)}`,
      `$${actualUSD.toFixed(2)}`,
      { text: `$${balanceUSD.toFixed(2)}`, color: balanceUSD < 0 ? '#dc3545' : '#28a745', bold: true },
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

  return [
    { text: 'Category Performance', style: 'sectionHeader', margin: [0, 15, 0, 5] },
    {
      table: { headerRows: 1, widths: ['*', 'auto', 'auto', 'auto', 'auto'], body: catBody },
      layout: tableLayout()
    }
  ];
}

function buildPdfBudgetVsActual(filteredExpenses, teamBudgets, filters) {
  let relevantBudgets = [...teamBudgets];
  if (filters.category || filters.sourceId || filters.currency) {
    const ids = new Set(filteredExpenses.map(e => e.budget_id));
    relevantBudgets = teamBudgets.filter(b => ids.has(b.id));
  }

  const body = [
    [
      { text: 'Budget', style: 'tableHeader' },
      { text: 'Budgeted', style: 'tableHeader' },
      { text: 'Actual', style: 'tableHeader' },
      { text: 'Balance', style: 'tableHeader' },
      { text: 'Status', style: 'tableHeader' }
    ]
  ];

  let grandBudgeted = 0;
  let grandActual = 0;

  relevantBudgets.forEach(budget => {
    const budgeted = budgetedUsd(budget);
    const actual = filteredExpenses
      .filter(e => e.budget_id === budget.id)
      .reduce((sum, e) => sum + (parseFloat(e.usd_amount) || 0), 0);
    const balance = budgeted - actual;
    grandBudgeted += budgeted;
    grandActual += actual;
    const status = categoryStatusLabel(budgeted, actual);
    body.push([
      budget.name,
      `$${budgeted.toFixed(2)}`,
      `$${actual.toFixed(2)}`,
      { text: `$${balance.toFixed(2)}`, color: balance < 0 ? '#dc3545' : '#28a745', bold: true },
      { text: status.text, color: status.color, bold: true }
    ]);
  });

  const grandBalance = grandBudgeted - grandActual;
  const grandStatus = categoryStatusLabel(grandBudgeted, grandActual);
  body.push([
    { text: 'GRAND TOTAL', bold: true },
    { text: `$${grandBudgeted.toFixed(2)}`, bold: true },
    { text: `$${grandActual.toFixed(2)}`, bold: true },
    {
      text: `$${grandBalance.toFixed(2)}`,
      color: grandBalance < 0 ? '#dc3545' : '#28a745',
      bold: true
    },
    { text: grandStatus.text, color: grandStatus.color, bold: true }
  ]);

  return [
    { text: 'Budget vs Actual', style: 'sectionHeader', margin: [0, 15, 0, 5] },
    {
      table: { headerRows: 1, widths: ['*', 'auto', 'auto', 'auto', 'auto'], body },
      layout: tableLayout()
    }
  ];
}
