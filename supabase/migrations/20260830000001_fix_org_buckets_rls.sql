-- Update RLS for org buckets to check app_role_assignments instead of hardcoded users.role
DROP POLICY IF EXISTS "Org Admins can view org buckets" ON buckets;
CREATE POLICY "Org Admins can view org buckets"
ON buckets
FOR SELECT
USING (
  is_org_level = true AND
  (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'ceo')
    )
    OR
    EXISTS (
      SELECT 1 FROM app_role_assignments
      WHERE app_role_assignments.user_id = auth.uid()
      AND app_role_assignments.app_code = 'finance'
      AND app_role_assignments.team_id IS NULL
    )
    OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('fih', 'caoh', 'oh', 'cao')
    )
  )
);

DROP POLICY IF EXISTS "Org Admins can manage org buckets" ON buckets;
CREATE POLICY "Org Admins can manage org buckets"
ON buckets
FOR ALL
USING (
  is_org_level = true AND
  (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'ceo')
    )
    OR
    EXISTS (
      SELECT 1 FROM app_role_assignments
      WHERE app_role_assignments.user_id = auth.uid()
      AND app_role_assignments.app_code = 'finance'
      AND app_role_assignments.team_id IS NULL
    )
    OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('fih', 'caoh', 'oh', 'cao')
    )
  )
);
