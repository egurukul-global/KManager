const fs = require('fs');
let code = fs.readFileSync('src/pages/expense-reports.js', 'utf8');

const target = `    const link = document.createElement('a');
    link.href = log.pdf_url;
    link.download = \`Report_\${logId.substring(0,8)}.pdf\`;
    link.click();`;

const replacement = `    const resolvedUrl = await resolveReceiptViewUrl(log.pdf_url);
    if (!resolvedUrl) return showToast('Could not resolve PDF URL', 'error');
    
    const link = document.createElement('a');
    link.href = resolvedUrl;
    link.download = \`Report_\${logId.substring(0,8)}.pdf\`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);`;

if (code.includes(target)) {
    code = code.replace(target, replacement);
    fs.writeFileSync('src/pages/expense-reports.js', code, 'utf8');
    console.log('Fixed downloadReportPdf URL resolution');
} else {
    console.log('Target string not found');
}
