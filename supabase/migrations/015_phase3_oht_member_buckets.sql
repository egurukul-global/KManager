-- Phase 3: OHT access level + member bucket convention
-- access_level 'oht' on user_teams = scoped read-only operations head (assign per team in Admin → Teams → Members)

COMMENT ON COLUMN user_teams.access_level IS
  'Team role: view | member (OTM) | oht (read-only ops) | lead (OTL) | admin';

-- Work-team member wallets: one bucket per user per team (buckets.owner_user_id = user id).
-- Created automatically when a member is added to a non-personal team (app logic).
