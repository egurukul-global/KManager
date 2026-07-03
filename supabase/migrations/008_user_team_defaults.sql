-- Per-user, per-team form defaults (budget, bucket, currency, etc.)
CREATE TABLE IF NOT EXISTS user_team_defaults (
  user_id UUID NOT NULL REFERENCES auth.users(id),
  team_id UUID NOT NULL,
  defaults JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_user_team_defaults_team
  ON user_team_defaults (team_id);

ALTER TABLE user_team_defaults ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_team_defaults_select ON user_team_defaults
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY user_team_defaults_write ON user_team_defaults
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND team_id IN (
      SELECT ut.team_id FROM user_teams ut WHERE ut.user_id = auth.uid()
    )
  );
