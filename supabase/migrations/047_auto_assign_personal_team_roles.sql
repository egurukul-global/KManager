-- Migration 047: Auto-assign OPH, FIN, and FIH roles to personal team owners on their personal team
INSERT INTO request_role_assignments (user_id, role_code, team_id, is_active)
SELECT 
  t.personal_owner_user_id,
  r.role_code,
  t.id,
  true
FROM teams t
CROSS JOIN (VALUES ('OPH'), ('FIN'), ('FIH')) AS r(role_code)
WHERE t.is_personal_team = true 
  AND t.personal_owner_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 
    FROM request_role_assignments rra
    WHERE rra.user_id = t.personal_owner_user_id
      AND upper(rra.role_code) = r.role_code
      AND rra.team_id = t.id
      AND rra.is_active = true
  );
