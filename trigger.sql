CREATE OR REPLACE FUNCTION trg_teams_after_insert_create_bucket()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO buckets (id, name, type, currency, balance, team_id, is_protected, is_system_bucket)
  VALUES (gen_random_uuid(), 'General Funds (Unallocated)', 'bank', 'USD', 0, NEW.id, true, true);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_teams_after_insert ON teams;
CREATE TRIGGER trg_teams_after_insert
AFTER INSERT ON teams
FOR EACH ROW
EXECUTE FUNCTION trg_teams_after_insert_create_bucket();
