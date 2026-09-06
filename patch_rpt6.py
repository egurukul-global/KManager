import sys

file_path = r'C:\Users\dell\Documents\GitHub\KManager-test\src\pages\expense-reports.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update modal HTML
old_modal = """          <label class="report-section-check"><input type="checkbox" id="rptSec_expenseDetail" checked> Expense Detail</label>
          <label class="report-section-check"><input type="checkbox" id="rptSec_categorySummary" checked> Category Summary</label>
          <label class="report-section-check"><input type="checkbox" id="rptSec_incomeSummary" checked> Income Summary</label>"""
new_modal = """          <label class="report-section-check"><input type="checkbox" id="rptSec_expenseDetail" checked> Expense Detail</label>
          <label class="report-section-check"><input type="checkbox" id="rptSec_categorySummary" checked> Category Summary</label>
          <label class="report-section-check"><input type="checkbox" id="rptSec_subcategorySummary"> Subcategory Summary (Detailed)</label>
          <label class="report-section-check"><input type="checkbox" id="rptSec_incomeSummary" checked> Income Summary</label>"""
content = content.replace(old_modal, new_modal)

# 2. Grab modal values
old_sections = """      const sections = {
        expenseDetail: modal.querySelector('#rptSec_expenseDetail').checked,
        categorySummary: modal.querySelector('#rptSec_categorySummary').checked,
        incomeSummary: modal.querySelector('#rptSec_incomeSummary').checked,"""
new_sections = """      const sections = {
        expenseDetail: modal.querySelector('#rptSec_expenseDetail').checked,
        categorySummary: modal.querySelector('#rptSec_categorySummary').checked,
        subcategorySummary: modal.querySelector('#rptSec_subcategorySummary').checked,
        incomeSummary: modal.querySelector('#rptSec_incomeSummary').checked,"""
content = content.replace(old_sections, new_sections)

# 3. Fix processReportGenerationInBg to resolve URLs
old_bg = """async function processReportGenerationInBg(logId, filters, sections) {
  try {
    const pdfLib = window.pdfMake;
    if(!pdfLib) throw new Error("pdfMake not loaded");
    
    // Build PDF
    const filteredExpenses = filterExpenses(filters);
    const budget = filters.budgetId ? teamBudgets.find(b => b.id === filters.budgetId) : null;
    const docDef = buildReportPdfDefinition({
      filters,
      sections,
      filteredExpenses,
      filteredIncome: filterIncomeByDates(filters),
      budget,
      getBucketName,
      getBudgetName,
      teamId: state.currentTeam?.team_id,
      teamCategories
    });
    
    pdfLib.createPdf(docDef).getBlob(async (blob) => {"""

new_bg = """async function processReportGenerationInBg(logId, filters, sections) {
  try {
    const pdfLib = window.pdfMake;
    if(!pdfLib) throw new Error("pdfMake not loaded");
    
    // Build PDF
    let filteredExpenses = filterExpenses(filters);
    
    // Resolve URLs
    filteredExpenses = await Promise.all(
      filteredExpenses.map(async (exp) => {
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

    const budget = filters.budgetId ? teamBudgets.find(b => b.id === filters.budgetId) : null;
    const docDef = buildReportPdfDefinition({
      filters,
      sections,
      filteredExpenses,
      filteredIncome: filterIncomeByDates(filters),
      budget,
      getBucketName,
      getBudgetName,
      teamId: state.currentTeam?.team_id,
      teamCategories
    });
    
    pdfLib.createPdf(docDef).getBlob(async (blob) => {"""
content = content.replace(old_bg, new_bg)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("expense-reports.js modal and bg patched")
