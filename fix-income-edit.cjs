const fs = require('fs');
let code = fs.readFileSync('src/pages/income.js', 'utf8');

// The onEditIncomeMathChange block:
const targetBlockStart = code.indexOf("document.getElementById('lblEditTotalIncome')");
if (targetBlockStart !== -1) {
    const endBlock = code.indexOf("}", targetBlockStart);
    if (endBlock !== -1) {
        code = code.substring(0, targetBlockStart) + "/* " + code.substring(targetBlockStart, endBlock) + " */" + code.substring(endBlock);
    }
}
fs.writeFileSync('src/pages/income.js', code, 'utf8');
console.log('Fixed onEditIncomeMathChange');
