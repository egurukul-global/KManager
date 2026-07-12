-- Ensure user_teams.access_level allows oht (Operations Head / OPH per team).
-- Older schemas may only allow member | lead | admin | view.

ALTER TABLE user_teams DROP CONSTRAINT IF EXISTS user_teams_access_level_check;

ALTER TABLE user_teams ADD CONSTRAINT user_teams_access_level_check
  CHECK (access_level IN ('view', 'member', 'oht', 'lead', 'admin'));

COMMENT ON COLUMN user_teams.access_level IS
  'Team membership level: view | member (OPS) | lead (OPL) | oht (OPH) | admin';
