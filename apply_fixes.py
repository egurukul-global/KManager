import re

with open('src/pages/transfer.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. getTransferFundsPage
content = re.sub(
    r'  const lead = isTeamLeadAccess\(state\);\s+return `\s+<h1 class="page-title">',
    r'  const lead = isTeamLeadAccess(state) || hasAnyGlobalFinanceRole();\n\n    return `\n      <h1 class="page-title">',
    content
)

# 2. updateDestFilterVisibility
update_vis_original = r'''function updateDestFilterVisibility\(\) \{
  const lead = isTeamLeadAccess\(state\);
  const memberFilters = document.getElementById\('trMemberFilters'\);
  const otmFilters = document.getElementById\('trOtmFilters'\);
  const crossSection = document.getElementById\('trCrossTeamSection'\);
  if \(memberFilters\) memberFilters.style.display = lead \? '' : 'none';
  if \(otmFilters\) otmFilters.style.display = lead \? 'none' : '';
  if \(crossSection\) crossSection.style.display = lead \? '' : 'none';
\}'''

update_vis_new = r'''import { hasAnyGlobalFinanceRole } from '../utils/appRoles.js';

function updateDestFilterVisibility() {
  const lead = isTeamLeadAccess(state);
  const globalAdmin = hasAnyGlobalFinanceRole();
  const memberFilters = document.getElementById('trMemberFilters');
  const otmFilters = document.getElementById('trOtmFilters');
  const crossSection = document.getElementById('trCrossTeamSection');
  if (memberFilters) memberFilters.style.display = (lead && !globalAdmin) ? '' : 'none';
  if (otmFilters) otmFilters.style.display = (!lead || globalAdmin) ? '' : 'none';
  if (crossSection) crossSection.style.display = lead ? '' : 'none';
}'''

content = re.sub(update_vis_original, update_vis_new, content)

# 3. onTransferDestFilterChange
filter_change_original = r'''function onTransferDestFilterChange\(\) \{
  const lead = isTeamLeadAccess\(state\);
  if \(lead\) \{
    destFilterState.showMembers = !!document.getElementById\('trShowMembers'\)\?\.checked;
  \} else \{
    destFilterState.showTeam = !!document.getElementById\('trShowTeamPeers'\)\?\.checked;
    destFilterState.showMembers = !!document.getElementById\('trShowMemberPeers'\)\?\.checked;
  \}
  populateDestSelect\(\);
  onTransferBucketChange\(\);
\}'''

filter_change_new = r'''function onTransferDestFilterChange() {
  const lead = isTeamLeadAccess(state);
  const globalAdmin = hasAnyGlobalFinanceRole();
  if (lead && !globalAdmin) {
    destFilterState.showMembers = !!document.getElementById('trShowMembers')?.checked;
  } else {
    destFilterState.showTeam = !!document.getElementById('trShowTeamPeers')?.checked;
    destFilterState.showMembers = !!document.getElementById('trShowMemberPeers')?.checked;
  }
  populateDestSelect();
  onTransferBucketChange();
}'''

content = re.sub(filter_change_original, filter_change_new, content)

# 4. initTransferFundsPage
init_original = r"if \(isTeamLeadAccess\(state\) \|\| \['admin', 'ceo', 'caoh', 'oh', 'fin', 'fip'\]\.includes\(String\(state\.user\?\.role \|\| ''\)\.toLowerCase\(\)\)\) \{"
init_new = r"if (isTeamLeadAccess(state) || hasAnyGlobalFinanceRole() || ['admin', 'ceo', 'caoh', 'oh', 'fin', 'fip'].includes(String(state.user?.role || '').toLowerCase())) {"

content = re.sub(init_original, init_new, content)

with open('src/pages/transfer.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('Applied fixes!')
