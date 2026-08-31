const fs = require('fs');
let code = fs.readFileSync('src/pages/expense-reports.js', 'utf8');

const targetStr = `    const link = document.createElement('a');
    link.href = resolvedUrl;
    link.download = \`Report_\${logId.substring(0,8)}.pdf\`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);`;

const replacementStr = `    window.open(resolvedUrl, '_blank');`;

if (code.includes(targetStr)) {
  code = code.replace(targetStr, replacementStr);
  fs.writeFileSync('src/pages/expense-reports.js', code, 'utf8');
  console.log('Fixed PDF to open in new tab');
} else {
  console.log('Target string not found');
}
