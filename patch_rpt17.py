import sys

file_path = r'C:\Users\dell\Documents\GitHub\KManager-test\src\pages\expense-reports.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the INSERT statement to REMOVE the name column, because it crashes the DB query!
old_insert = """    const enhancedFilters = { ...filters, reportName: sections.reportName };
    await sbInsert('report_logs', {
      id: logId,
      team_id: teamId,
      budget_id: budgetId || null,
      filters: enhancedFilters,
      sections,
      name: sections.reportName || null,
      status: 'in_progress',
      created_by: state.user.id,
      created_at: now,
      updated_at: now
    });"""

new_insert = """    const enhancedFilters = { ...filters, reportName: sections.reportName };
    await sbInsert('report_logs', {
      id: logId,
      team_id: teamId,
      budget_id: budgetId || null,
      filters: enhancedFilters,
      sections,
      status: 'in_progress',
      created_by: state.user.id,
      created_at: now,
      updated_at: now
    });"""

content = content.replace(old_insert, new_insert)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("expense-reports.js removed name column from insert")
