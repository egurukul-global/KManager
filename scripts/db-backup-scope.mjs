import { readFileSync, writeFileSync } from 'fs';
const state = JSON.parse(readFileSync('scripts/.db-live-state.json', 'utf-8'));

const KM_TABLES = [
  'users', 'user_teams', 'teams', 'team_relationships', 'user_team_defaults',
  'app_roles', 'app_role_assignments', 'request_role_assignments',
  'buckets', 'bucket_access', 'transfers', 'exchange_rates',
  'budget_plans', 'budget_types', 'budget_type_templates', 'budget_type_template_assignments',
  'budget_calendar_entries', 'budget_categories', 'categories', 'category_master', 'subcategory_master',
  'expenses', 'expense_receipts', 'expense_attachments',
  'income',
  'approval_requests', 'approval_flow_definitions', 'approval_flow_steps', 'approval_messages',
  'approval_request_reconciliation_lines',
  'reconciliation_submissions', 'reconciliation_lines', 'daily_reconciliation',
  'tasks',
  'chat_groups', 'chat_group_members', 'chat_permissions', 'chat_preferences', 'messages',
  'ok_admins', 'ok_app_access', 'ok_app_admins', 'ok_home_pins', 'ok_menu_access', 'ok_messages',
  'report_logs', 'audit_log', 'user_groups', 'team_groups', 'team_group_members'
];

// Verified against actual function bodies before finalizing this list (2026-09-06):
// user_groups/team_groups/team_group_members turned out to be KManager's own
// group-based team-access feature (used by get_accessible_teams, which the app
// itself calls via .rpc()) - moved into KM_TABLES above, not excluded here.
// access_grants/app_areas were checked the same way and confirmed NOT referenced
// by anything the app actually calls - correctly excluded.
const OTHER_APP_MARKERS = [
  'egur_', 'ops_', 'skt_', 'vault_items', 'vault_shares', 'FROM vaults', 'JOIN vaults',
  'family_secrets', 'device_sessions', 'access_grants', 'app_areas',
  'funds', 'is_vault_owner', 'can_access_vault', 'has_vault_permission',
  'can_manage_share', 'is_group_member', 'is_member_of', 'has_access_grant',
  'assign_user_to_home', 'remove_user_from_home', 'can_access_app', 'can_message'
];

// Confirm which KM_TABLES actually exist live, and report any that don't (typo/renamed).
const liveTableNames = new Set(state.tables.filter(t => t.schemaname === 'public').map(t => t.tablename));
const missing = KM_TABLES.filter(t => !liveTableNames.has(t));
const confirmed = KM_TABLES.filter(t => liveTableNames.has(t));
console.log(`KM_TABLES: ${KM_TABLES.length} listed, ${confirmed.length} confirmed live, ${missing.length} NOT FOUND live:`, missing);

// Explicitly excluded by name: confirmed (2026-09-06, during baseline smoke-testing) to
// reference tables that don't exist ANYWHERE in the live database (memberships,
// user_profiles - not even for the other apps) and are never called by KM's own code.
// Either dead cruft from an old schema iteration, or another app's user-lifecycle system.
const DEAD_OR_UNRELATED_FUNCTIONS = new Set([
  'is_admin_or_above', 'is_super_user', 'can_approve_users', 'approve_user', 'suspend_user'
]);

// Functions: include only those whose definition doesn't reference another app's tables/functions.
const kmFunctions = state.functions.filter(f => {
  if (DEAD_OR_UNRELATED_FUNCTIONS.has(f.name)) return false;
  const def = f.definition || '';
  return !OTHER_APP_MARKERS.some(marker => def.includes(marker));
});
const excludedFunctions = state.functions.filter(f => !kmFunctions.includes(f));
console.log(`\nFunctions: ${state.functions.length} total, ${kmFunctions.length} in KM scope, ${excludedFunctions.length} excluded (other apps):`);
excludedFunctions.forEach(f => console.log(`  excluded: ${f.name}`));

writeFileSync('scripts/.km-scope.json', JSON.stringify({ confirmed, missing, kmFunctionNames: kmFunctions.map(f => f.name) }, null, 2));
console.log('\nWritten scripts/.km-scope.json');
