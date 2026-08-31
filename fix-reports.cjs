const fs = require('fs');
let code = fs.readFileSync('src/pages/expense-reports.js', 'utf8');

const switchFunc = `function switchReportsTab(tabName) {
  const btnGen = document.getElementById('btnTabGenerate');
  const btnLogs = document.getElementById('btnTabLogs');
  const tabGen = document.getElementById('tabContentGenerate');
  const tabLogs = document.getElementById('tabContentLogs');

  if (!btnGen || !btnLogs || !tabGen || !tabLogs) return;

  if (tabName === 'generate') {
    btnGen.classList.add('active');
    btnGen.style.fontWeight = 'bold';
    btnGen.style.borderBottom = '3px solid var(--primary)';
    btnGen.style.color = 'var(--text)';

    btnLogs.classList.remove('active');
    btnLogs.style.fontWeight = 'normal';
    btnLogs.style.borderBottom = 'none';
    btnLogs.style.color = 'var(--text-secondary)';

    tabGen.style.display = 'block';
    tabLogs.style.display = 'none';
  } else {
    btnLogs.classList.add('active');
    btnLogs.style.fontWeight = 'bold';
    btnLogs.style.borderBottom = '3px solid var(--primary)';
    btnLogs.style.color = 'var(--text)';

    btnGen.classList.remove('active');
    btnGen.style.fontWeight = 'normal';
    btnGen.style.borderBottom = 'none';
    btnGen.style.color = 'var(--text-secondary)';

    tabLogs.style.display = 'block';
    tabGen.style.display = 'none';
  }
}

`;

code = code.replace('export async function initExpenseReportsPage() {', switchFunc + 'export async function initExpenseReportsPage() {');

fs.writeFileSync('src/pages/expense-reports.js', code, 'utf8');
console.log('Fixed switchReportsTab');
