import re

with open('src/pages/buckets.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove the JS permission check completely
old_save = r"""  const isGlobalAdmin = \['admin', 'ceo', 'caoh', 'oh', 'fih'\]\.includes\(String\(state\.user\?\.role \|\| ''\)\.toLowerCase\(\)\);\n\n  if \(isEdit && !state\.canEditBuckets\) \{\n    showToast\('You do not have permission to edit buckets', 'error'\);\n    return;\n  \}\n  if \(!isEdit && !state\.canCreateBuckets && !isGlobalAdmin\) \{\n    showToast\('You do not have permission to create buckets', 'error'\);\n    return;\n  \}"""

new_save = r"""  // Rely entirely on DB RLS for permissions per user request
  // Removed hardcoded role bypasses"""

content = re.sub(old_save, new_save, content)

# Fix the team_id logic
old_team = r"""        if \(isOrgBucket\) \{\n          bucketData\.is_org_level = true;\n          bucketData\.team_id = null;\n        \} else \{\n          bucketData\.team_id = state\.currentTeam\?\.team_id \|\| null;\n        \}"""

new_team = r"""        if (isOrgBucket) {
          bucketData.is_org_level = true;
          bucketData.team_id = state.currentTeam?.team_id; // Must not be null due to DB constraint
        } else {
          bucketData.team_id = state.currentTeam?.team_id;
        }"""

content = re.sub(old_team, new_team, content)

with open('src/pages/buckets.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Bypass removed, team_id fixed")
