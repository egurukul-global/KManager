const fs = require('fs');
let code = fs.readFileSync('src/pages/manager-finance.js', 'utf8');

// Fix the property names in the summaryMap assignment
code = code.replace(/summaryMap\[key\]\.allocated \+= \(b\.allocated \|\| 0\);/g, "summaryMap[key].allocated += (b.allocated_amount || 0);");
code = code.replace(/summaryMap\[key\]\.expenses \+= \(b\.expenses \|\| 0\);/g, "summaryMap[key].expenses += (b.expenses_amount || 0);");
code = code.replace(/summaryMap\[key\]\.returned \+= \(b\.funds_returned \|\| 0\);/g, "summaryMap[key].returned += (b.unused_funds_returned || 0);");

// Fix the HTML generation string to not use escapeHtml or formatMoney
const regexHTML = /tbody\.innerHTML = summaryGroups\.map\(g => \{[\s\S]*?\}\)\.join\(''\);/;
const replacementHTML = `tbody.innerHTML = summaryGroups.map(g => {
      const net = g.allocated - g.expenses - g.returned;
      const statusClass = net === 0 ? 'success' : (net < 0 ? 'error' : 'warning');
      const safeLabel = (g.label || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return "<tr><td style=\\"font-weight: bold;\\">" + safeLabel + "</td><td>" + g.count + "</td><td>" + (g.allocated).toFixed(2) + "</td><td>" + (g.expenses).toFixed(2) + "</td><td>" + (g.returned).toFixed(2) + "</td><td><span class=\\"status-pill " + statusClass + "\\">" + (net).toFixed(2) + "</span></td></tr>";
    }).join('');`;

code = code.replace(regexHTML, replacementHTML);

fs.writeFileSync('src/pages/manager-finance.js', code);
console.log('Fixed properties and missing functions');
