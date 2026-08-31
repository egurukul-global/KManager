import re

with open('src/pages/transfer.js', 'r', encoding='utf-8') as f:
    content = f.read()

broken_pattern = re.compile(r'function populateDestSelect\(\) \{.*?\n  const \{ data, error \} = await supabaseClient', re.DOTALL)

fixed_code = """function populateDestSelect() {
  const select = document.getElementById('trDestBucketId');
  if (!select) return;
  const current = select.value;
  const dests = filterBucketsForTransferDest(teamBucketsCache, state, destFilterState);
  const srcId = document.getElementById('trSourceBucketId')?.value;
  select.innerHTML = '<option value="">Select destination</option>';
  dests.filter(b => b.id !== srcId).forEach(b => {
    const tag = isMemberBucket(b) ? ' - Member' : ' - Team';
    const teamName = b.teams?.name ? ` [${b.teams.name}]` : '';
    select.innerHTML += `<option value="${b.id}" data-currency="${b.currency}">${escapeHtml(b.name)}${teamName}${tag} (${b.currency})</option>`;
  });
  if (dests.some(b => b.id === current && b.id !== srcId)) select.value = current;
}

function updateDestFilterVisibility() {
  const lead = isTeamLeadAccess(state);
  const globalAdmin = hasAnyGlobalFinanceRole();
  const memberFilters = document.getElementById('trMemberFilters');
  const otmFilters = document.getElementById('trOtmFilters');
  const crossSection = document.getElementById('trCrossTeamSection');
  if (memberFilters) memberFilters.style.display = (lead && !globalAdmin) ? '' : 'none';
  if (otmFilters) otmFilters.style.display = (!lead || globalAdmin) ? '' : 'none';
  if (crossSection) crossSection.style.display = lead ? '' : 'none';
}

async function loadTeamMembers() {
  const teamId = state.currentTeam?.team_id;
  if (!teamId) {
    teamMembersCache = [];
    return [];
  }
  const { data, error } = await supabaseClient"""

content = broken_pattern.sub(fixed_code, content)

with open('src/pages/transfer.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('Fixed!')
