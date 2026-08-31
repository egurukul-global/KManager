const fs = require('fs');
const lines = fs.readFileSync('src/pages/expense-reports.js', 'utf8').split('\n');
const match = lines.filter(l => l.includes('id="tab') || l.includes('tabContent') || l.includes('Tab Content'));
console.log(match.join('\n'));
