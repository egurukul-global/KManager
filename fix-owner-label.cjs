const fs = require('fs');
let code = fs.readFileSync('src/pages/manager-finance.js', 'utf8');

code = code.replace(/<option value="person">Group by: Owner<\/option>/, '<option value="person">Group by: Requester</option>');
code = code.replace(/if \(groupBy === 'person'\) thLabel = 'Owner';/, "if (groupBy === 'person') thLabel = 'Requester';");

fs.writeFileSync('src/pages/manager-finance.js', code);
