const fs = require('fs');
let code = fs.readFileSync('src/pages/expenses.js', 'utf8');

const regex = /urlInput\.value = key;[\s\S]*?renderPreviews\(\);/;
const replacement = `urlInput.value = key;
        urlInput.dispatchEvent(new Event('input'));
        if (hint) hint.textContent = 'Uploaded successfully. URL populated.';
        if (hint) hint.className = 'form-hint success';
        renderPreviews();`;

code = code.replace(regex, replacement);
fs.writeFileSync('src/pages/expenses.js', code);
