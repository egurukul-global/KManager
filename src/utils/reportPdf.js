// ==================== EXPENSE REPORT PDF EXPORT ====================
import { showToast } from '../components/toasts.js';
import { getExpenseCategoryLabel } from './expenseHelpers.js';
import { isExternalReceiptUrl } from './upload.js';
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
export function buildReportPdfDefinition(params) {
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

  let receiptCounter = 1001;
  const annexureItems = [];

  if (sections.expenseDetail) {
    const categoriesMap = {};
    filteredExpenses.forEach(exp => {
      const catLabel = getExpenseCategoryLabel(exp, teamCategories);
      if (!categoriesMap[catLabel]) {
        categoriesMap[catLabel] = [];
      }
      categoriesMap[catLabel].push(exp);
    });

    const sortedCategoryLabels = Object.keys(categoriesMap).sort((a, b) => a.localeCompare(b));

    sortedCategoryLabels.forEach(catLabel => {
      const groupExpenses = categoriesMap[catLabel];
      groupExpenses.sort((a, b) => a.date.localeCompare(b.date));

      const expenseBody = [
        [
          { text: 'Receipt', style: 'tableHeader' },
          { text: 'Date', style: 'tableHeader' },
          { text: 'Item', style: 'tableHeader' },
          { text: 'Source', style: 'tableHeader' },
          { text: 'Local', style: 'tableHeader' },
          { text: 'Rate', style: 'tableHeader' },
          { text: 'USD Total', style: 'tableHeader' }
        ]
      ];

      let groupUSDTotal = 0;

      groupExpenses.forEach(exp => {
        const usdAmount = parseFloat(exp.usd_amount) || 0;
        groupUSDTotal += usdAmount;

        const receiptNumbers = [];
        const images = exp.receipt_images || [];

        images.forEach(imgBase64 => {
          const num = receiptCounter++;
          receiptNumbers.push(num);
          annexureItems.push({
            number: num,
            exp,
            image: imgBase64
          });
        });

        if (images.length === 0 && exp.receipt_url) {
          const num = receiptCounter++;
          receiptNumbers.push(num);
          annexureItems.push({
            number: num,
            exp,
            image: exp.receipt_resolved_url || exp.receipt_url
          });
        }

        const receiptCell = receiptNumbers.length 
          ? {
              text: receiptNumbers.map((n, idx) => {
                const arr = [{ text: `#${n}`, linkToDestination: `receipt-${n}`, color: '#0284c7', decoration: 'underline' }];
                if (idx < receiptNumbers.length - 1) {
                  arr.push({ text: ', ', color: '#000' });
                }
                return arr;
              }).flat()
            }
          : '—';

        expenseBody.push([
          receiptCell,
          exp.date,
          truncReportItem(exp.item),
          getBucketName ? getBucketName(exp.bucket_id) : '—',
          `${(exp.local_amount || 0).toLocaleString()} ${exp.currency || ''}`,
          String(exp.rate ?? '—'),
          `$${usdAmount.toFixed(2)}`
        ]);
      });

      expenseBody.push([
        { text: 'Total', colSpan: 6, alignment: 'right', bold: true },
        {}, {}, {}, {}, {},
        { text: `$${groupUSDTotal.toFixed(2)} USD`, bold: true }
      ]);

      content.push(
        { text: catLabel, style: 'sectionHeader', margin: [0, 15, 0, 5] },
        {
          table: {
            headerRows: 1,
            widths: ['auto', 'auto', '*', 'auto', 'auto', 'auto', 'auto'],
            body: expenseBody
          },
          layout: tableLayout(),
          margin: [0, 0, 0, 15]
        }
      );
    });
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
      ? filteredIncome.filter(fund => (fund.budget_allocations || []).some(alloc => alloc.budget_id === budget.id))
      : filteredIncome;

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

    rows.forEach(fund => {
      let localDisplay = '—';
      if (fund.local_amount && fund.currency) {
        localDisplay = `${(parseFloat(fund.local_amount) || 0).toLocaleString()} ${fund.currency}`;
      }
      incomeBody.push([
        fund.date,
        fund.payment_from || '—',
        getBucketName ? getBucketName(fund.bucket_id) : '—',
        localDisplay,
        `$${(parseFloat(fund.amount_usd) || 0).toFixed(2)}`,
        fund.description || '—'
      ]);
    });

    content.push(
      { text: 'Income Summary', style: 'incomeHeader', margin: [0, 15, 0, 5] },
      {
        table: {
          headerRows: 1,
          widths: ['auto', 'auto', 'auto', 'auto', 'auto', '*'],
          body: incomeBody
        },
        layout: tableLayout()
      }
    );
  }

  if (annexureItems.length > 0) {
    content.push({ text: 'Annexure - Receipts', style: 'sectionHeader', pageBreak: 'before', margin: [0, 20, 0, 10] });

    annexureItems.forEach((item, idx) => {
      const exp = item.exp;
      const usdAmount = parseFloat(exp.usd_amount) || 0;
      
      const metadataTable = {
        table: {
          widths: ['*', '*'],
          body: [
            [{ text: 'Type', bold: true }, 'Expense'],
            [{ text: 'Item', bold: true }, exp.item || '—'],
            [{ text: 'Date', bold: true }, exp.date],
            [{ text: 'Local Amount', bold: true }, `${(exp.local_amount || 0).toLocaleString()} ${exp.currency || ''}`],
            [{ text: 'Rate', bold: true }, String(exp.rate ?? '—')],
            [{ text: 'USD Total', bold: true }, `$${usdAmount.toFixed(2)}`],
            [{ text: 'Bucket Source', bold: true }, getBucketName ? getBucketName(exp.bucket_id) : '—'],
            [{ text: 'Category', bold: true }, getExpenseCategoryLabel(exp, teamCategories)],
            [{ text: 'Description/Notes', bold: true }, exp.description || '—']
          ]
        },
        layout: 'lightHorizontalLines',
        margin: [0, 5, 0, 15]
      };

      const pageContent = [
        { text: `Receipt Reference: #${item.number}`, id: `receipt-${item.number}`, style: 'sectionHeader', margin: [0, 10, 0, 10] },
        metadataTable
      ];

      if (item.image && (item.image.startsWith('data:image/') || item.image.startsWith('data:'))) {
        pageContent.push({
          image: item.image,
          fit: [450, 400],
          alignment: 'center',
          margin: [0, 10, 0, 0]
        });
      } else if (item.image) {
        pageContent.push({
          text: 'View Receipt File in Browser (External Link)',
          link: item.image,
          color: '#0284c7',
          decoration: 'underline',
          alignment: 'center',
          margin: [0, 20, 0, 0]
        });
      }

      content.push({
        stack: pageContent,
        pageBreak: idx === 0 ? 'none' : 'before'
      });
    });
  }

  return {
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
}

export function exportExpenseReportToPdf(params) {
  const pdfMake = getPdfMake();
  if (!pdfMake) {
    showToast('PDF library not loaded. Refresh the page and try again.', 'error');
    return;
  }

  const docDefinition = buildReportPdfDefinition(params);
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
