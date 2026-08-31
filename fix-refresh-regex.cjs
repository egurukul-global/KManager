const fs = require('fs');
let code = fs.readFileSync('src/pages/expense-reports.js', 'utf8');

const regex = /\/\/ Switch tab to Logs\s*switchReportsTab\('logs'\);\s*\/\/ Run in background without blocking/;
if (regex.test(code)) {
  code = code.replace(regex, "// Switch tab to Logs\n    switchReportsTab('logs');\n    refreshReportLogs();\n\n    // Run in background without blocking");
  fs.writeFileSync('src/pages/expense-reports.js', code, 'utf8');
  console.log('Fixed immediate log refresh via regex');
} else {
  console.log('Regex did not match');
}
