import sys

file_path = r'C:\Users\dell\Documents\GitHub\KManager-test\src\pages\expense-reports.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix processReportGenerationInBg
old_docdef = """    const docDef = buildReportPdfDefinition({
      filters,
      sections,
      filteredExpenses,
      filteredIncome: filterIncomeByDates(filters),
      budget,
      getBucketName,
      getBudgetName,
      teamId: state.currentTeam?.team_id,
      teamCategories
    });"""

new_docdef = """    const docDef = buildReportPdfDefinition({
      filters,
      sections,
      filteredExpenses,
      filteredIncome: filterIncomeByDates(filters),
      budget,
      getBucketName,
      getBudgetName,
      teamId: state.currentTeam?.team_id,
      teamCategories,
      teamName: getTeamName()
    });"""
content = content.replace(old_docdef, new_docdef)

# Fix exportReportToPDF
old_export = """    exportExpenseReportToPdf({
      ...lastReportSnapshot,
      filteredExpenses: resolvedExpenses,
      getBucketName,
      getBudgetName
    });"""

new_export = """    exportExpenseReportToPdf({
      ...lastReportSnapshot,
      filteredExpenses: resolvedExpenses,
      getBucketName,
      getBudgetName,
      teamName: getTeamName()
    });"""
content = content.replace(old_export, new_export)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("expense-reports.js teamName patched")
