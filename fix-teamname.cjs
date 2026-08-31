const fs = require('fs');
let code = fs.readFileSync('src/pages/expense-reports.js', 'utf8');
code = code.replace(/teamName: getReportTeamName\(\),/g, 'teamName: getReportTeamName(state),');
fs.writeFileSync('src/pages/expense-reports.js', code, 'utf8');
console.log('Fixed getReportTeamName argument');
