const fs = require('fs');
let code = fs.readFileSync('src/pages/manager-finance.js', 'utf8');

// Replace the HTML starting from <div class="filter-section" ... to the end of the template string
const htmlRegex = /<div class="filter-section"[\s\S]*?<\/table>\s*<\/div>\s*<\/div>\s*`;/;
const newHtml = `<div class="filter-section" style="margin-bottom: 20px; display: flex; flex-direction: column; gap:15px; background: rgba(255,255,255,0.02); padding: 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
        
        <div style="display: flex; gap: 15px; flex-wrap: wrap;">
          <div class="toggle-group" style="display:flex; gap: 4px; background: rgba(0,0,0,0.2); padding: 4px; border-radius: 6px; flex: 0 0 auto;">
            <button id="finViewDetailedBtn" class="sq-btn primary" onclick="window.setFinView('detailed')" style="padding: 6px 12px; font-size: 0.85em; height: auto;">Detailed</button>
            <button id="finViewSummaryBtn" class="sq-btn secondary" onclick="window.setFinView('summary')" style="padding: 6px 12px; font-size: 0.85em; height: auto;">Summary</button>
          </div>

          <div class="form-group" style="flex: 2; min-width:200px; margin: 0;">
            <input type="text" id="finSearchInput" placeholder="Search by Team, Budget, Owner..." onkeyup="window.renderFinanceTable()" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text);">
          </div>

          <div class="form-group" id="finGroupByContainer" style="display:none; flex: 1; min-width: 140px; margin: 0;">
            <select id="finGroupBy" onchange="window.renderFinanceTable()" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text);">
              <option value="team">Group by: Team</option>
              <option value="person">Group by: Owner</option>
              <option value="oph">Group by: OPH</option>
            </select>
          </div>
        </div>

        <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
          <div class="form-group" style="flex: 0 0 140px; margin: 0;">
            <input type="date" id="finDateFrom" onchange="window.renderFinanceTable()" title="From Date" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text);">
          </div>
          <div class="form-group" style="flex: 0 0 140px; margin: 0;">
            <input type="date" id="finDateTo" onchange="window.renderFinanceTable()" title="To Date" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text);">
          </div>

          <div class="form-group" style="flex:1; min-width:180px; position:relative; margin: 0;">
            <div onclick="const d = document.getElementById('finTeamDropdown'); d.style.display = d.style.display === 'none' ? 'block' : 'none';" style="border:1px solid var(--border); padding:8px 12px; cursor:pointer; border-radius:4px; background:var(--bg-secondary); color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" id="finTeamLabel">All Teams</div>
            <div id="finTeamDropdown" onmouseleave="this.style.display='none'" style="display:none; position:absolute; top:100%; left:0; right:0; background:var(--bg, #fff); border:1px solid var(--border); z-index:10; max-height:250px; overflow-y:auto; padding:8px; box-shadow:0 8px 16px rgba(0,0,0,0.5);"></div>
          </div>

          <div class="form-group" style="flex:1; min-width:180px; position:relative; margin: 0;">
            <div onclick="const d = document.getElementById('finBudgetDropdown'); d.style.display = d.style.display === 'none' ? 'block' : 'none';" style="border:1px solid var(--border); padding:8px 12px; cursor:pointer; border-radius:4px; background:var(--bg-secondary); color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" id="finBudgetLabel">All Budgets</div>
            <div id="finBudgetDropdown" onmouseleave="this.style.display='none'" style="display:none; position:absolute; top:100%; left:0; right:0; background:var(--bg, #fff); border:1px solid var(--border); z-index:10; max-height:250px; overflow-y:auto; padding:8px; box-shadow:0 8px 16px rgba(0,0,0,0.5);"></div>
          </div>

          <div class="form-group" style="flex: 0 0 120px; margin: 0;">
            <select id="finStatusFilter" onchange="window._finFilterError = false; window.renderFinanceTable()" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text);">
              <option value="ALL">All Statuses</option>
              <option value="OPEN">Open</option>
              <option value="CLOSED">Reconciled</option>
            </select>
          </div>

          <div class="form-group" style="flex: 0 0 auto; margin: 0; display:flex; gap: 4px;">
            <button type="button" class="secondary small" onclick="window.exportFinanceReportToCSV()" style="padding:8px 12px; font-size:0.85em;">CSV</button>
            <button type="button" class="secondary small" onclick="window.exportFinanceReportToPDF()" style="padding:8px 12px; font-size:0.85em;">PDF</button>
          </div>
        </div>
      </div>
      
      <div class="table-responsive" id="finTableContainer">
        <table class="data-table">
          <thead id="finTableHead">
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
          <tbody id="financeDashboardTableBody">
            <tr><td colspan="7" style="text-align:center;">Loading database view...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;`;
code = code.replace(htmlRegex, newHtml);
fs.writeFileSync('src/pages/manager-finance.js', code);
console.log('HTML updated.');
