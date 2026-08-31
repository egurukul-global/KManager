const fs = require('fs');
let code = fs.readFileSync('src/pages/manager-finance.js', 'utf8');

code = code.replace(
  "import { downloadCSV, convertArrayOfObjectsToCSV } from '../utils/exportCsv.js';",
  "import { downloadCSV, convertArrayOfObjectsToCSV } from '../utils/exportCsv.js';\nimport { formatUsdDisplay } from '../utils/currency.js';"
);

fs.writeFileSync('src/pages/manager-finance.js', code);
