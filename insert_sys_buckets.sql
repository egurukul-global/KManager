DO $$
DECLARE
  global_team_id UUID;
BEGIN
  -- We'll just tie Org Bank to a dummy or "all" team, or we can use team_id of a specific team, but KManager teams usually exist.
  -- Let's just create a dummy team or fetch the first team for Org-Bank.
  -- Actually, let's just insert it without team_id? No, team_id is NO NULL.
  -- Let's get the first team just as a placeholder, or maybe there's a global team?
  SELECT id INTO global_team_id FROM teams WHERE is_deleted = false LIMIT 1;
  
  -- Or even better, KManager might have a 'global' team. 
  -- We'll just use global_team_id.
  
  IF NOT EXISTS (SELECT 1 FROM buckets WHERE name = 'ORG-BANK' AND is_org_level = true) THEN
    INSERT INTO buckets (id, name, type, currency, balance, team_id, is_org_level, is_protected)
    VALUES (gen_random_uuid(), 'ORG-BANK', 'bank', 'USD', 100000.00, global_team_id, true, true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM buckets WHERE name = 'UNUSED_FUNDS' AND is_system_bucket = true) THEN
    INSERT INTO buckets (id, name, type, currency, balance, team_id, is_system_bucket, is_protected)
    VALUES (gen_random_uuid(), 'UNUSED_FUNDS', 'system', 'USD', 0.00, global_team_id, true, true);
  END IF;
END $$;
