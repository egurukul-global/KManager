-- Fix infinite recursion on users RLS (policy was querying users inside users policy).
-- Run this immediately if you applied 011_team_management_rls.sql.

CREATE OR REPLACE FUNCTION public.is_org_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role IN ('admin', 'caoh', 'oh', 'ceo')
  );
$$;

REVOKE ALL ON FUNCTION public.is_org_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_org_admin() TO authenticated;

-- Replace recursive users policy with two non-recursive policies
DROP POLICY IF EXISTS users_admin_select ON users;
DROP POLICY IF EXISTS users_select_own ON users;
DROP POLICY IF EXISTS users_select_org_admin ON users;

CREATE POLICY users_select_own ON users
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY users_select_org_admin ON users
  FOR SELECT TO authenticated
  USING (public.is_org_admin());

-- Rebuild team policies to use the helper (avoids nested users lookups)
DROP POLICY IF EXISTS teams_admin_write ON teams;
DROP POLICY IF EXISTS user_teams_select ON user_teams;
DROP POLICY IF EXISTS user_teams_admin_write ON user_teams;

CREATE POLICY teams_admin_write ON teams
  FOR ALL TO authenticated
  USING (public.is_org_admin())
  WITH CHECK (public.is_org_admin());

CREATE POLICY user_teams_select ON user_teams
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_org_admin());

CREATE POLICY user_teams_admin_write ON user_teams
  FOR ALL TO authenticated
  USING (public.is_org_admin())
  WITH CHECK (public.is_org_admin());
