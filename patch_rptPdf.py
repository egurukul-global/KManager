import sys

file_path = r'C:\Users\dell\Documents\GitHub\KManager-test\src\utils\reportPdf.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update annexure generation to use receipts_resolved_urls
old_receipt = """        if (images.length === 0 && exp.receipt_url) {
          const num = receiptCounter++;
          receiptNumbers.push(num);
          annexureItems.push({
            number: num,
            exp,
            image: exp.receipt_resolved_url || exp.receipt_url
          });
        }"""
new_receipt = """        if (images.length === 0) {
          const urls = exp.receipts_resolved_urls || [];
          if (urls.length === 0 && exp.receipt_url) urls.push(exp.receipt_resolved_url || exp.receipt_url);
          
          urls.forEach(url => {
            const num = receiptCounter++;
            receiptNumbers.push(num);
            annexureItems.push({
              number: num,
              exp,
              image: url
            });
          });
        }"""
content = content.replace(old_receipt, new_receipt)

# 2. Rewrite buildPdfCategoryPerformance to roll up categories properly
old_catPerf = """function buildPdfCategoryPerformance(filteredExpenses, budget, teamCategories) {
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
}"""

new_catPerf = """function buildPdfCategoryPerformance(filteredExpenses, budget, teamCategories, includeSubcategory) {
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

  const map = new Map();

  (budget.categories || []).forEach(cat => {
    let label;
    if (includeSubcategory) {
      label = (cat.category || cat.name) + (cat.subcategory ? ` / ${cat.subcategory}` : '');
    } else {
      label = cat.category || cat.name;
    }
    const prev = map.get(label) || { budgeted: 0, actual: 0 };
    prev.budgeted += parseFloat(cat.usdAmount ?? cat.usd_amount) || 0;
    map.set(label, prev);
  });

  filteredExpenses.forEach(exp => {
    let label;
    if (includeSubcategory) {
      const fullLabel = getExpenseCategoryLabel(exp, teamCategories);
      label = fullLabel.replace(' → ', ' / ');
    } else {
      if (exp.category_id && teamCategories) {
        const cat = teamCategories.find(c => c.id === exp.category_id);
        label = cat ? cat.name : (exp.vendor_info || 'Unknown');
      } else {
        label = exp.vendor_info || 'Unknown';
      }
    }
    const prev = map.get(label) || { budgeted: 0, actual: 0 };
    prev.actual += parseFloat(exp.usd_amount) || 0;
    map.set(label, prev);
  });

  [...map.entries()].sort((a,b) => a[0].localeCompare(b[0])).forEach(([label, data]) => {
    catGrandBudgeted += data.budgeted;
    catGrandActual += data.actual;
    const balanceUSD = data.budgeted - data.actual;
    const status = categoryStatusLabel(data.budgeted, data.actual);
    catBody.push([
      label,
      `$${data.budgeted.toFixed(2)}`,
      `$${data.actual.toFixed(2)}`,
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
}"""

content = content.replace(old_catPerf, new_catPerf)

# 3. Call buildPdfCategoryPerformance and aggregateSpendByCategory with sections.subcategorySummary
old_cat_summary_call = """  if (sections.categorySummary) {
    if (budget) {
      content.push(...buildPdfCategoryPerformance(filteredExpenses, budget, teamCategories));
    } else {
      content.push(...buildPdfBudgetVsActual(filteredExpenses, teamBudgets, filters));
      const byCat = aggregateSpendByCategory(filteredExpenses, teamCategories);"""

new_cat_summary_call = """  if (sections.categorySummary) {
    if (budget) {
      content.push(...buildPdfCategoryPerformance(filteredExpenses, budget, teamCategories, sections.subcategorySummary));
    } else {
      content.push(...buildPdfBudgetVsActual(filteredExpenses, teamBudgets, filters));
      const byCat = aggregateSpendByCategory(filteredExpenses, teamCategories, sections.subcategorySummary);"""
content = content.replace(old_cat_summary_call, new_cat_summary_call)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("reportPdf.js patched")
