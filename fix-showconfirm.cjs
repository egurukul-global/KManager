const fs = require('fs');
let code = fs.readFileSync('src/pages/expense-reports.js', 'utf8');

// 1. Add showConfirm to imports from toasts.js
if (!code.includes('showConfirm')) {
  code = code.replace(/import \{ showToast \} from '\.\.\/components\/toasts\.js';/, 
    "import { showToast, showConfirm } from '../components/toasts.js';");
}

// 2. Change window.showConfirm to showConfirm
code = code.replace(/window\.showConfirm/g, 'showConfirm');

fs.writeFileSync('src/pages/expense-reports.js', code, 'utf8');
console.log('Fixed showConfirm');
