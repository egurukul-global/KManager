-- Phase 3b: OHT team roster management + teams created under an OHT

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS created_by_oht_user_id UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_teams_oht_creator
  ON teams (created_by_oht_user_id)
  WHERE created_by_oht_user_id IS NOT NULL;

/** Org admin, or OHT assigned to team, or OHT who created the team. */
CREATE OR REPLACE FUNCTION public.is_team_roster_manager(p_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_org_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_teams ut
      WHERE ut.team_id = p_team_id
        AND ut.user_id = auth.uid()
        AND lower(trim(ut.access_level)) = 'oht'
    )
    OR EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = p_team_id
        AND t.created_by_oht_user_id = auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION public.is_team_roster_manager(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_team_roster_manager(uuid) TO authenticated;

DROP POLICY IF EXISTS teams_oht_create ON teams;
CREATE POLICY teams_oht_create ON teams
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_admin()
    OR (
      created_by_oht_user_id = auth.uid()
      AND is_personal_team = false
    )
  );

DROP POLICY IF EXISTS teams_oht_update ON teams;
CREATE POLICY teams_oht_update ON teams
  FOR UPDATE TO authenticated
  USING (
    public.is_org_admin()
    OR created_by_oht_user_id = auth.uid()
  )
  WITH CHECK (
    public.is_org_admin()
    OR created_by_oht_user_id = auth.uid()
  );

DROP POLICY IF EXISTS user_teams_oht_write ON user_teams;
CREATE POLICY user_teams_oht_write ON user_teams
  FOR ALL TO authenticated
  USING (public.is_team_roster_manager(team_id))
  WITH CHECK (public.is_team_roster_manager(team_id));

-- OHT needs user list when adding members to their teams
DROP POLICY IF EXISTS users_select_oht_roster ON users;
CREATE POLICY users_select_oht_roster ON users
  FOR SELECT TO authenticated
  USING (
    public.is_org_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_teams ut
      WHERE ut.user_id = auth.uid()
        AND lower(trim(ut.access_level)) = 'oht'
    )
  );
