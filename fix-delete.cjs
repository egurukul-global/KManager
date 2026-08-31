const fs = require('fs');
let code = fs.readFileSync('src/pages/expense-reports.js', 'utf8');

// Add supabaseClient to db.js import if missing
if (!code.includes('supabaseClient')) {
  code = code.replace(/import \{ sbSelect, sbInsert, sbUpdate \} from '\.\.\/db\.js';/, 
    "import { sbSelect, sbInsert, sbUpdate, supabaseClient } from '../db.js';");
}

const targetFunc = `export async function deleteReportLog(logId) {
  if (!confirm('Are you sure you want to delete this report log?')) return;
  try {
    const { error } = await sbUpdate('report_logs', logId, { is_deleted: true, deleted_at: new Date().toISOString() });
    if (error) throw error;
    showToast('Report log deleted.', 'success');
    refreshReportLogs();
  } catch (err) {
    showToast(err.message || 'Failed to delete report log', 'error');
  }
}`;

const replacementFunc = `export async function deleteReportLog(logId) {
  window.showConfirm('Are you sure you want to delete this report log?', async () => {
    try {
      // Use raw supabaseClient WITHOUT .select() to prevent PostgREST 403 Forbidden on hidden rows
      const { error } = await supabaseClient
        .from('report_logs')
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .eq('id', logId);
        
      if (error) throw error;
      showToast('Report log deleted.', 'success');
      refreshReportLogs();
    } catch (err) {
      showToast(err.message || 'Failed to delete report log', 'error');
    }
  });
}`;

if (code.includes('export async function deleteReportLog(logId) {')) {
  // Use regex to replace the old function block
  const regex = /export async function deleteReportLog\(logId\) \{[\s\S]*?\n\}/;
  if (regex.test(code)) {
    code = code.replace(regex, replacementFunc);
    fs.writeFileSync('src/pages/expense-reports.js', code, 'utf8');
    console.log('Fixed deleteReportLog');
  } else {
    console.log('Regex did not match function');
  }
} else {
  console.log('deleteReportLog function not found');
}
