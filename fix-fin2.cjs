const fs = require('fs');
let code = fs.readFileSync('src/pages/manager-finance.js', 'utf8');

const oldQueues = /<h2>Actionable Queues<\/h2>[\s\S]*?<\/div>\s*<\/div>/m;
const newQueues = `<h2>Actionable Queues</h2>
      <div style="display: flex; gap: 15px; margin-bottom: 20px;">
        <button class="btn" style="flex:1; padding:20px; background-color:var(--error); color:white; cursor:pointer;" onclick="document.getElementById('finStatusFilter').value = 'ERROR'; window.renderFinanceTable();" title="Click to view budgets with negative balances">
          <h3 id="qReconError">...</h3>
          <p>Reconciliation Errors</p>
        </button>
        <button class="btn" style="flex:1; padding:20px; background-color:var(--primary); color:white; cursor:pointer;" onclick="window.showPage('reconciliation-approval')" title="Click to review pending team transfers">
          <h3 id="qPendingTransfers">...</h3>
          <p>Pending Transfers</p>
        </button>
      </div>
    </div>`;

code = code.replace(oldQueues, newQueues);
fs.writeFileSync('src/pages/manager-finance.js', code, 'utf8');
console.log('Fixed Queues HTML');
