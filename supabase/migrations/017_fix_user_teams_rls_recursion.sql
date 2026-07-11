-- Fix infinite recursion on user_teams RLS introduced by 016_oht_team_roster.sql
-- Cause: user_teams_oht_write (FOR ALL) called is_team_roster_manager(), which
-- queried user_teams again while RLS was still evaluating policies on user_teams.
-- Run this immediately in Supabase SQL editor if you see:
--   "infinite recursion detected in policy for relation user_teams"

-- Helper: is current user an OHT on any team? (bypasses RLS inside function)
CREATE OR REPLACE FUNCTION public.user_is_oht()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_teams ut
    WHERE ut.user_id = auth.uid()
      AND lower(trim(ut.access_level)) = 'oht'
  );
$$;

REVOKE ALL ON FUNCTION public.user_is_oht() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_is_oht() TO authenticated;

-- Roster manager check: must bypass RLS when reading user_teams / teams
CREATE OR REPLACE FUNCTION public.is_team_roster_manager(p_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT
    public.is_org_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_teams ut
      WHERE ut.team_id = p_team_id
        AND ut.user_id = auth.uid()
        AND lower(trim(ut.access_level)) = 'oht'
    )
    OR EXISTS (
      SELECT 1
      FROM public.teams t
      WHERE t.id = p_team_id
        AND t.created_by_oht_user_id = auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION public.is_team_roster_manager(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_team_roster_manager(uuid) TO authenticated;

-- SELECT: own rows, org admin, or OHT managing this team's roster
DROP POLICY IF EXISTS user_teams_select ON user_teams;
CREATE POLICY user_teams_select ON user_teams
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_org_admin()
    OR public.is_team_roster_manager(team_id)
  );

-- WRITE: OHT roster managers only (not FOR ALL — that included SELECT and caused recursion)
DROP POLICY IF EXISTS user_teams_oht_write ON user_teams;
DROP POLICY IF EXISTS user_teams_oht_insert ON user_teams;
DROP POLICY IF EXISTS user_teams_oht_update ON user_teams;
DROP POLICY IF EXISTS user_teams_oht_delete ON user_teams;

CREATE POLICY user_teams_oht_insert ON user_teams
  FOR INSERT TO authenticated
  WITH CHECK (public.is_team_roster_manager(team_id));

CREATE POLICY user_teams_oht_update ON user_teams
  FOR UPDATE TO authenticated
  USING (public.is_team_roster_manager(team_id))
  WITH CHECK (public.is_team_roster_manager(team_id));

CREATE POLICY user_teams_oht_delete ON user_teams
  FOR DELETE TO authenticated
  USING (public.is_team_roster_manager(team_id));

-- users list for OHT add-member dropdown (avoid inline user_teams subquery in policy)
DROP POLICY IF EXISTS users_select_oht_roster ON users;
CREATE POLICY users_select_oht_roster ON users
  FOR SELECT TO authenticated
  USING (public.is_org_admin() OR public.user_is_oht());
