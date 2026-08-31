const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');

code = code.replace(/<div class="nav-subitem" data-page="manager-finance" onclick="window\.showPage\('manager-finance'\)">Manager - Finance<\/div>/g, '<div class="nav-subitem" data-page="manager-finance" onclick="window.showPage(\'manager-finance\')">Receivables</div>');
code = code.replace(/'manager-finance': 'Manager - Finance'/g, "'manager-finance': 'Receivables'");

fs.writeFileSync('src/main.js', code);
