import sys
file_path = r'C:\Users\dell\Documents\GitHub\KManager-test\src\pages\expense-reports.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

old_code = """  // Background process logging
  const logId = crypto.randomUUID();
  const teamId = state.currentTeam?.team_id;
  if (teamId) {
    const now = new Date().toISOString();
    await sbInsert('report_logs', {"""

new_code = """  // Background process logging
  if (teamId) {
    await sbInsert('report_logs', {"""

content = content.replace(old_code, new_code)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("expense-reports.js logId error fixed")
