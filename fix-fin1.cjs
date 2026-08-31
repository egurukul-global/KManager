const fs = require('fs');
let code = fs.readFileSync('src/pages/manager-finance.js', 'utf8');

// 1. Replace the entire filter-section and table HTML
const oldHtmlRegex = /<div class="filter-section"[\s\S]*?<tbody id="financeDashboardTableBody">/m;
const newHtml = `<div class="filter-section" style="margin-bottom: 20px; display: flex; gap:10px; align-items:flex-end; flex-wrap:wrap;">
        
        <div class="form-group" style="flex:1; min-width:200px; position:relative;">
          <label>Filter by Team</label>
          <div onclick="const d = document.getElementById('finTeamDropdown'); d.style.display = d.style.display === 'none' ? 'block' : 'none';" style="border:1px solid var(--border); padding:8px 12px; cursor:pointer; border-radius:4px; background:var(--bg-secondary); color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" id="finTeamLabel">
            All Teams
          </div>
          <div id="finTeamDropdown" style="display:none; position:absolute; top:100%; left:0; right:0; background:var(--card-bg); border:1px solid var(--border); z-index:10; max-height:250px; overflow-y:auto; padding:8px; box-shadow:0 8px 16px rgba(0,0,0,0.3);">
            <!-- Populated dynamically -->
          </div>
        </div>

        <div class="form-group" style="flex:1; min-width:200px; position:relative;">
          <label>Filter by Budget</label>
          <div onclick="const d = document.getElementById('finBudgetDropdown'); d.style.display = d.style.display === 'none' ? 'block' : 'none';" style="border:1px solid var(--border); padding:8px 12px; cursor:pointer; border-radius:4px; background:var(--bg-secondary); color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" id="finBudgetLabel">
            All Budgets
          </div>
          <div id="finBudgetDropdown" style="display:none; position:absolute; top:100%; left:0; right:0; background:var(--card-bg); border:1px solid var(--border); z-index:10; max-height:250px; overflow-y:auto; padding:8px; box-shadow:0 8px 16px rgba(0,0,0,0.3);">
            <!-- Populated dynamically -->
          </div>
        </div>

        <div class="form-group" style="flex:1; min-width:150px;">
          <label>Status</label>
          <select id="finStatusFilter" onchange="window.renderFinanceTable()">
            <option value="ALL">All Statuses</option>
            <option value="OPEN">Open</option>
            <option value="CLOSED">Reconciled</option>
          </select>
        </div>
        
        <div style="display:flex; gap:8px;">
          <button type="button" class="secondary small" onclick="window.exportFinanceReportToCSV()" style="padding:8px 12px; font-size:0.85em;">CSV</button>
          <button type="button" class="secondary small" onclick="window.exportFinanceReportToPDF()" style="padding:8px 12px; font-size:0.85em;">PDF</button>
        </div>
      </div>
      
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Team</th>
              <th>Budget Plan</th>
              <th>Allocated</th>
              <th>Expenses Logged</th>
              <th>Funds Returned</th>
              <th>Remaining Held</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody id="financeDashboardTableBody">`;

code = code.replace(oldHtmlRegex, newHtml);
fs.writeFileSync('src/pages/manager-finance.js', code, 'utf8');
console.log('Fixed HTML layout');
