DO $$
DECLARE
  global_team_id UUID;
BEGIN
  SELECT id INTO global_team_id FROM teams LIMIT 1;
  
  IF NOT EXISTS (SELECT 1 FROM buckets WHERE name = 'ORG-BANK' AND is_org_level = true) THEN
    INSERT INTO buckets (id, name, type, currency, balance, team_id, is_org_level, is_protected)
    VALUES (gen_random_uuid(), 'ORG-BANK', 'bank', 'USD', 100000.00, global_team_id, true, true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM buckets WHERE name = 'UNUSED_FUNDS' AND is_system_bucket = true) THEN
    INSERT INTO buckets (id, name, type, currency, balance, team_id, is_system_bucket, is_protected)
    VALUES (gen_random_uuid(), 'UNUSED_FUNDS', 'system', 'USD', 0.00, global_team_id, true, true);
  END IF;
END $$;
