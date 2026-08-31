const fs = require('fs');
let code = fs.readFileSync('src/pages/manager-finance.js', 'utf8');

const regex1 = /<div class="card">\s*<h2>Actionable Queues<\/h2>/;
const repl1 = `<div class="stats-grid dash-stats" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; margin-bottom: 25px;">
      <div class="card card-hover glass" style="padding: 20px; border-radius: var(--radius); border: 1px solid var(--border); box-shadow: var(--shadow);">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary);">Total Allocated</span>
          <div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(59, 130, 246, 0.1); color: var(--primary); display: flex; align-items: center; justify-content: center;"><i class="fa-solid fa-coins"></i></div>
        </div>
        <div>
          <h3 id="mgrBlobAllocated" style="font-size: 1.8rem; font-weight: 700; margin: 0; color: var(--text);">...</h3>
          <p style="font-size: 0.75rem; color: var(--text-muted); margin: 4px 0 0 0;">Income assigned to budgets</p>
        </div>
      </div>
      <div class="card card-hover glass" style="padding: 20px; border-radius: var(--radius); border: 1px solid var(--border); box-shadow: var(--shadow);">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary);">Booked Expenses</span>
          <div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(239, 68, 68, 0.1); color: var(--error); display: flex; align-items: center; justify-content: center;"><i class="fa-solid fa-receipt"></i></div>
        </div>
        <div>
          <h3 id="mgrBlobExpenses" style="font-size: 1.8rem; font-weight: 700; margin: 0; color: var(--text);">...</h3>
          <p style="font-size: 0.75rem; color: var(--text-muted); margin: 4px 0 0 0;">Expenses attached to budgets</p>
        </div>
      </div>
      <div class="card card-hover glass" style="padding: 20px; border-radius: var(--radius); border: 1px solid var(--border); box-shadow: var(--shadow);">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary);">Outstanding</span>
          <div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(245, 158, 11, 0.1); color: var(--warning); display: flex; align-items: center; justify-content: center;"><i class="fa-solid fa-scale-unbalanced"></i></div>
        </div>
        <div>
          <h3 id="mgrBlobOutstanding" style="font-size: 1.8rem; font-weight: 700; margin: 0; color: var(--text);">...</h3>
          <p style="font-size: 0.75rem; color: var(--text-muted); margin: 4px 0 0 0;">Allocated minus Booked</p>
        </div>
      </div>
    </div>
    
    <div class="card">
      <h2>Actionable Queues</h2>`;

code = code.replace(regex1, repl1);

fs.writeFileSync('src/pages/manager-finance.js', code);
