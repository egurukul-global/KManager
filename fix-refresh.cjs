const fs = require('fs');
let code = fs.readFileSync('src/pages/expense-reports.js', 'utf8');

const targetStr = `    // Switch tab to Logs
    switchReportsTab('logs');

    // Run in background without blocking
    processReportGenerationInBg(logId, filters, sections);`;

const replacementStr = `    // Switch tab to Logs
    switchReportsTab('logs');
    
    // Refresh the table immediately so the user sees the 'Generating...' row
    refreshReportLogs();

    // Run in background without blocking
    processReportGenerationInBg(logId, filters, sections);`;

if (code.includes(targetStr)) {
  code = code.replace(targetStr, replacementStr);
  fs.writeFileSync('src/pages/expense-reports.js', code, 'utf8');
  console.log('Fixed immediate log refresh');
} else {
  console.log('Target string not found');
}
