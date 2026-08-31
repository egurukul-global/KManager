ALTER TABLE buckets ADD COLUMN IF NOT EXISTS is_org_level BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE buckets ADD COLUMN IF NOT EXISTS is_system_bucket BOOLEAN NOT NULL DEFAULT false;

INSERT INTO buckets (id, name, type, currency, balance, team_id, is_protected, is_system_bucket)
SELECT gen_random_uuid(), 'General Funds (Unallocated)', 'bank', 'USD', 0, id, true, true
FROM teams
WHERE id NOT IN (
  SELECT team_id FROM buckets WHERE name = 'General Funds (Unallocated)' AND team_id IS NOT NULL
);
