const fs = require('fs');
let code = fs.readFileSync('src/pages/manager-expenses.js', 'utf8');

const htmlRegex = /export function getManagerExpensesPage\(\) \{[\s\S]*?\}\n/g;
const newHtml = `export function getManagerExpensesPage() {
  return \`
    <h1 class="page-title">Global Expense Approvals</h1>
    <p class="page-intro">Review and approve expenses submitted by teams.</p>
    
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 15px;">
        <h2>Pending Reviews</h2>
        <div class="bulk-actions" style="display:flex; gap:10px;">
          <button class="primary" onclick="window.approveSelectedExpenses()">Approve Selected</button>
        </div>
      </div>
      
      <div class="filter-bar" style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom: 20px;">
        <input type="text" id="mgrExpSearch" placeholder="Search item..." oninput="window.refreshManagerExpenseList()">
        
        <select id="mgrExpTeamFilter" onchange="window.refreshManagerExpenseList()">
          <option value="">All Teams</option>
        </select>
        
        <select id="mgrExpBudgetFilter" onchange="window.refreshManagerExpenseList()">
          <option value="">All Budgets</option>
        </select>
        
        <div style="display:flex; gap:5px; align-items:center;">
          <input type="date" id="mgrExpDateFrom" onchange="window.refreshManagerExpenseList()">
          <span>to</span>
          <input type="date" id="mgrExpDateTo" onchange="window.refreshManagerExpenseList()">
        </div>
        
        <button class="secondary small" onclick="window.resetManagerExpenseFilters()">Reset</button>
      </div>
      
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th class="checkbox-col"><input type="checkbox" onchange="window.toggleAllMgrExpenses(this)"></th>
              <th>Date</th>
              <th>Team</th>
              <th>Item</th>
              <th>Category</th>
              <th>Local</th>
              <th>USD</th>
              <th>Receipt</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="mgrExpensesTableBody">
            <tr><td colspan="10" style="text-align:center;">Loading pending expenses...</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Rejection Modal -->
    <div id="rejectExpenseModal" class="modal">
      <div class="modal-content" style="max-width: 400px;">
        <span class="close" onclick="document.getElementById('rejectExpenseModal').style.display='none'">&times;</span>
        <h2>Send Back Expense</h2>
        <p>Please provide a reason for rejecting this expense. It will be sent back to the team as a Draft.</p>
        <form onsubmit="window.submitExpenseRejection(event)">
          <input type="hidden" id="rejectExpId">
          <div class="form-group">
            <label>Reason / Notes</label>
            <textarea id="rejectExpNotes" rows="3" required placeholder="e.g., Receipt is blurry, wrong category..."></textarea>
          </div>
          <button type="submit" class="danger" style="width:100%;">Reject & Send Back</button>
        </form>
      </div>
    </div>
  \`;
}
`;

code = code.replace(htmlRegex, newHtml);

// I will write the rest of the JS directly to update the logic
fs.writeFileSync('src/pages/manager-expenses.js', code);
