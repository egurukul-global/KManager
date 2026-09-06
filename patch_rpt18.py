import sys

file_path = r'C:\Users\dell\Documents\GitHub\KManager-test\src\pages\expense-reports.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

old_code = """        financialSummary: modal.querySelector('#rptSec_financialSummary').checked,
        receiptStyle: modal.querySelector('input[name="rptSec_receiptStyle"]:checked').value
      };
      if (!Object.values(sections).some(Boolean)) {"""

new_code = """        financialSummary: modal.querySelector('#rptSec_financialSummary').checked,
        receiptStyle: modal.querySelector('input[name="rptSec_receiptStyle"]:checked').value,
        reportName: modal.querySelector('#rptSec_reportName').value.trim()
      };
      // Ignore reportName for validation of "at least one section"
      const { reportName, ...sectionsForVal } = sections;
      if (!Object.values(sectionsForVal).some(Boolean)) {"""

content = content.replace(old_code, new_code)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("expense-reports.js extraction fixed")
