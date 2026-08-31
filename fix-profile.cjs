const fs = require('fs');
let code = fs.readFileSync('src/pages/profile.js', 'utf8');

const target = `    <div class="card">
      <h2>View Settings</h2>`;
      
const replacement = `    <div class="card">
      <h2>Dashboard Settings</h2>
      <p class="page-intro">Configure how your dashboard totals are calculated.</p>
      <div class="form-stack">
        <div class="form-group">
          <label>Expenses Timeline</label>
          <select id="profileDashTimeline" onchange="window.toggleDashTimelineDate()">
            <option value="all">All Time</option>
            <option value="month">Current Month</option>
            <option value="from_date">From Specific Date...</option>
          </select>
        </div>
        <div class="form-group" id="profileDashDateGroup" style="display:none;">
          <label>From Date</label>
          <input type="date" id="profileDashFromDate" />
        </div>
        <button type="button" class="btn" onclick="window.saveDashboardSettings()">Save Dashboard Settings</button>
      </div>
    </div>

    <div class="card">
      <h2>View Settings</h2>`;

code = code.replace(target, replacement);

const scriptTarget = `window.saveProfileSettings = async function(e) {`;
const scriptReplacement = `window.toggleDashTimelineDate = function() {
  const t = document.getElementById('profileDashTimeline').value;
  document.getElementById('profileDashDateGroup').style.display = t === 'from_date' ? 'block' : 'none';
};

window.saveDashboardSettings = function() {
  const t = document.getElementById('profileDashTimeline').value;
  const d = document.getElementById('profileDashFromDate').value;
  localStorage.setItem('kmanager_dash_timeline', t);
  if (d) localStorage.setItem('kmanager_dash_from_date', d);
  window.showToast('Dashboard timeline saved', 'success');
};

window.saveProfileSettings = async function(e) {`;

code = code.replace(scriptTarget, scriptReplacement);

const initTarget = `export async function initProfilePage() {`;
const initReplacement = `export async function initProfilePage() {
  setTimeout(() => {
    const t = localStorage.getItem('kmanager_dash_timeline') || 'all';
    const d = localStorage.getItem('kmanager_dash_from_date') || '';
    const sel = document.getElementById('profileDashTimeline');
    if(sel) {
      sel.value = t;
      window.toggleDashTimelineDate();
      if(d) document.getElementById('profileDashFromDate').value = d;
    }
  }, 100);
`;

code = code.replace(initTarget, initReplacement);

fs.writeFileSync('src/pages/profile.js', code);
