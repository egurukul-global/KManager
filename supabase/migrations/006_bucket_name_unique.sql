-- Unique bucket names per team (case-insensitive, active rows only)
CREATE UNIQUE INDEX IF NOT EXISTS idx_buckets_team_name_unique
  ON buckets (team_id, lower(trim(name)))
  WHERE is_deleted = false;
