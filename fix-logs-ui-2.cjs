const fs = require('fs');
let code = fs.readFileSync('src/pages/expense-reports.js', 'utf8');

// 1. Remove <th>Filter Criteria</th> using a regex to catch any indentation/newlines
const thRegex = /\s*<th>Filter Criteria<\/th>/;
if (thRegex.test(code)) {
  code = code.replace(thRegex, '');
  console.log('Removed <th>Filter Criteria</th>');
} else {
  console.log('<th>Filter Criteria</th> not found');
}

// 2. Change Delete button text to X
const oldButtonStr = `>Delete</button>`;
const newButtonStr = `>✖</button>`;
if (code.includes('window.deleteReportLog')) {
  code = code.replace(oldButtonStr, newButtonStr);
  console.log('Changed Delete button text to ✖');
}

fs.writeFileSync('src/pages/expense-reports.js', code, 'utf8');
