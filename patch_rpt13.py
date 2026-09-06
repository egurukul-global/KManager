import sys

file_path = r'C:\Users\dell\Documents\GitHub\KManager-test\src\pages\expense-reports.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

old_cancel = """window.cancelReportLog = async function(logId) {
  if(!confirm('Cancel report generation?')) return;
  await supabaseClient.from('report_logs').update({ status: 'failed', error_message: 'Cancelled by user' }).eq('id', logId);
  refreshReportLogs();
};"""

new_cancel = """window.cancelReportLog = async function(logId) {
  showConfirm('Cancel report generation?', async () => {
    await supabaseClient.from('report_logs').update({ status: 'failed', error_message: 'Cancelled by user' }).eq('id', logId);
    refreshReportLogs();
  });
};"""

content = content.replace(old_cancel, new_cancel)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("expense-reports.js cancel fix")
