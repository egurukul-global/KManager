INSERT INTO buckets (id, name, type, currency, balance, team_id, is_protected)
SELECT gen_random_uuid(), 'General Funds (Unallocated)', 'OPERATIONAL', 'USD', 0, id, true
FROM teams
WHERE id NOT IN (
  SELECT team_id FROM buckets WHERE name = 'General Funds (Unallocated)' AND team_id IS NOT NULL
);
