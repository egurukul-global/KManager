import sys

file_path = r'C:\Users\dell\Documents\GitHub\KManager-test\src\pages\expense-reports.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Fix initExpenseReportsPage missing references
content = content.replace("window.downloadReportPdf = downloadReportPdf;", "")
content = content.replace("window.cancelReportLog = cancelReportLog;", "")
content = content.replace("setTimeout(() => refreshReportLogs(), 50);", "")

# 2. Fix promptAndGenerateExpenseReport to actually display results
old_prompt = """  try {
    await sbInsert('report_logs', {
      id: logId,
      team_id: teamId,
      budget_id: budgetId || null,
      filters,
      sections,
      status: 'in_progress',
      created_by: state.user.id,
      created_at: now,
      updated_at: now
    });

    // Switch tab to Logs
    switchReportsTab('logs');
    refreshReportLogs();

    // Run in background without blocking
    processReportGenerationInBg(logId, filters, sections);

  } catch (err) {
    showToast(err.message || 'Failed to start report generation', 'error');
  }"""

new_prompt = """  lastReportSnapshot = {
    filters,
    sections,
    filteredExpenses: filterExpenses(filters),
    filteredIncome: filterIncomeByDates(filters)
  };

  const resultsEl = document.getElementById('expenseReportResults');
  if (resultsEl) {
    if (lastReportSnapshot.filteredExpenses.length === 0) {
      resultsEl.innerHTML = '<p style="padding: 20px; text-align: center; color: var(--text-secondary);">No expenses found for these filters.</p>';
    } else {
      let html = '<table class="table-stack-mobile" style="margin-top: 15px;"><thead><tr><th>Date</th><th>Item</th><th>Category</th><th>Local Amount</th><th>USD Amount</th></tr></thead><tbody>';
      lastReportSnapshot.filteredExpenses.forEach(exp => {
        let catLabel = 'Unknown';
        if (teamCategories && exp.category_id) {
            const cat = teamCategories.find(c => c.id === exp.category_id);
            catLabel = cat ? cat.name : (exp.vendor_info || 'Unknown');
        } else {
            catLabel = exp.vendor_info || 'Unknown';
        }
        
        html += `<tr>
          <td>${exp.date}</td>
          <td>${exp.item}</td>
          <td>${catLabel}</td>
          <td>${exp.local_amount} ${exp.currency}</td>
          <td>$${exp.usd_amount}</td>
        </tr>`;
      });
      html += '</tbody></table>';
      resultsEl.innerHTML = html;
    }
  }

  showToast('Report generated successfully', 'success');"""

content = content.replace(old_prompt, new_prompt)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Patched successfully")
