-- ================================================================
-- Migration 072: Money Buckets access fixes
-- 1) Finance payment roles (FIH/FIP/FIN/CAO/CAOH/OH/CEO/Admin) can
--    view ALL buckets - needed so the Transfer Funds "Pay Approved
--    Budget" card can list destination team buckets.
-- 2) Team leads/admins can create and manage their OWN team's buckets
--    (Money Buckets now lives in the team-level Setup menu).
--
-- Each statement is wrapped in its own DO block so a failure in one
-- does not abort the others, and reports which policy failed.
-- ================================================================

-- ----------------------------------------------------------------
-- 1) Payment roles can read all buckets
--    Mirrors is_org_admin(): users.role OR a global finance/ok
--    app_role_assignment (roles are often granted app-level).
-- ----------------------------------------------------------------
DO $$
BEGIN
  DROP POLICY IF EXISTS "Finance payment roles can view buckets" ON buckets;
  CREATE POLICY "Finance payment roles can view buckets"
  ON buckets
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND
    (
      public.is_org_admin()
      OR EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid()
          AND users.role IN ('fih', 'fip', 'fin', 'cao', 'caoh', 'oh', 'ceo', 'admin')
      )
      OR EXISTS (
        SELECT 1 FROM public.app_role_assignments a
        WHERE a.user_id = auth.uid()
          AND a.app_code IN ('finance', 'ok')
          AND a.team_id IS NULL
      )
    )
  );
  RAISE NOTICE 'OK: Finance payment roles can view buckets';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'FAILED (payment roles view): % (%)', SQLERRM, SQLSTATE;
END $$;

-- ----------------------------------------------------------------
-- 2) Team leads/admins can manage their own team's buckets
-- ----------------------------------------------------------------
DO $$
BEGIN
  DROP POLICY IF EXISTS "Team leads can manage team buckets" ON buckets;
  CREATE POLICY "Team leads can manage team buckets"
  ON buckets
  FOR ALL
  USING (
    auth.uid() IS NOT NULL AND
    is_org_level = false AND
    EXISTS (
      SELECT 1 FROM public.user_teams ut
      WHERE ut.user_id = auth.uid()
        AND ut.team_id = buckets.team_id
        AND ut.access_level IN ('lead', 'admin')
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL AND
    is_org_level = false AND
    EXISTS (
      SELECT 1 FROM public.user_teams ut
      WHERE ut.user_id = auth.uid()
        AND ut.team_id = buckets.team_id
        AND ut.access_level IN ('lead', 'admin')
    )
  );
  RAISE NOTICE 'OK: Team leads can manage team buckets';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'FAILED (team leads manage): % (%)', SQLERRM, SQLSTATE;
END $$;

