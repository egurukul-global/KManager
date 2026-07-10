-- Team management: org admins can create/rename teams and manage memberships.
-- All authenticated users can read teams (for switcher joins).

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS teams_select ON teams;
DROP POLICY IF EXISTS teams_admin_write ON teams;
DROP POLICY IF EXISTS user_teams_select ON user_teams;
DROP POLICY IF EXISTS user_teams_own_update ON user_teams;
DROP POLICY IF EXISTS user_teams_admin_write ON user_teams;
DROP POLICY IF EXISTS users_admin_select ON users;

CREATE POLICY teams_select ON teams
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY teams_admin_write ON teams
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'caoh', 'oh', 'ceo')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'caoh', 'oh', 'ceo')
    )
  );

CREATE POLICY user_teams_select ON user_teams
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'caoh', 'oh', 'ceo')
    )
  );

-- Users can update their own rows (e.g. primary team switcher)
CREATE POLICY user_teams_own_update ON user_teams
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY user_teams_admin_write ON user_teams
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'caoh', 'oh', 'ceo')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'caoh', 'oh', 'ceo')
    )
  );

-- Org admins can list users when assigning team members
CREATE POLICY users_admin_select ON users
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'caoh', 'oh', 'ceo')
    )
  );
