const fs = require('fs');
let code = fs.readFileSync('src/pages/profile.js', 'utf8');

const htmlRegex = /<div class="card">\s*<h2>Dashboard Settings<\/h2>[\s\S]*?<\/div>\s*<div class="card">\s*<h2>View Settings<\/h2>/;
const newHtml = `<div class="card">
      <h2>Dashboard Settings</h2>
      <p class="page-intro">Configure how your dashboard totals are calculated based on your custom Budget Calendar.</p>
      <div class="form-stack">
        <div class="form-group">
          <label>Expenses Timeline</label>
          <select id="profileDashTimeline" onchange="window.toggleDashTimelineDate()">
            <option value="all">All Time</option>
            <option value="current_period">Current Budget Period</option>
            <option value="specific_period">Specific Budget Period...</option>
          </select>
        </div>
        <div class="form-group" id="profileDashPeriodGroup" style="display:none;">
          <label>Select Period</label>
          <select id="profileDashSpecificPeriod">
            <option value="">Loading periods...</option>
          </select>
        </div>
        <button type="button" class="btn" onclick="window.saveDashboardSettings()">Save Dashboard Settings</button>
      </div>
    </div>

    <div class="card">
      <h2>View Settings</h2>`;

code = code.replace(htmlRegex, newHtml);

const jsRegex = /window\.toggleDashTimelineDate = function\(\) \{[\s\S]*?export async function initProfilePage/;
const newJs = `window.toggleDashTimelineDate = function() {
  const t = document.getElementById('profileDashTimeline').value;
  document.getElementById('profileDashPeriodGroup').style.display = t === 'specific_period' ? 'block' : 'none';
};

window.saveDashboardSettings = function() {
  const t = document.getElementById('profileDashTimeline').value;
  const p = document.getElementById('profileDashSpecificPeriod').value;
  localStorage.setItem('kmanager_dash_timeline', t);
  if (p) localStorage.setItem('kmanager_dash_period_date', p);
  window.showToast('Dashboard timeline saved', 'success');
};

window.saveProfileSettings = async function(e) {
  e.preventDefault();
  const v = document.getElementById('profileDefaultView').value;
  const { error } = await window.supabaseClient.from('users').update({ default_login_view: v }).eq('id', window.state.user.id);
  if (error) window.showToast('Error saving settings', 'error');
  else window.showToast('Settings saved successfully', 'success');
};

async function loadBudgetCalendarForProfile() {
  try {
    const { data } = await window.supabaseClient.from('budget_calendar_entries').select('name, budget_period_date').eq('is_deleted', false).order('budget_period_date', { ascending: false });
    const sel = document.getElementById('profileDashSpecificPeriod');
    if (sel && data) {
      sel.innerHTML = data.map(d => \`<option value="\${d.budget_period_date}">\${d.name} (\${d.budget_period_date})</option>\`).join('');
      const savedP = localStorage.getItem('kmanager_dash_period_date');
      if (savedP) sel.value = savedP;
    }
  } catch(e) {}
}

export async function initProfilePage`;

code = code.replace(jsRegex, newJs);

const initRegex = /const t = localStorage\.getItem\('kmanager_dash_timeline'\) \|\| 'all';\s*const d = localStorage\.getItem\('kmanager_dash_from_date'\) \|\| '';\s*const sel = document\.getElementById\('profileDashTimeline'\);\s*if\(sel\) \{\s*sel\.value = t;\s*window\.toggleDashTimelineDate\(\);\s*if\(d\) document\.getElementById\('profileDashFromDate'\)\.value = d;\s*\}/;

const newInit = `const t = localStorage.getItem('kmanager_dash_timeline') || 'all';
    const sel = document.getElementById('profileDashTimeline');
    if(sel) {
      sel.value = t;
      window.toggleDashTimelineDate();
    }
    loadBudgetCalendarForProfile();`;

code = code.replace(initRegex, newInit);

fs.writeFileSync('src/pages/profile.js', code);
