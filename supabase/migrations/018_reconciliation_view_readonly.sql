-- Block VIEW and OHT team access from submitting reconciliations (read-only finance roles).
-- UI also hides Reconcile for these roles; this enforces at the database.

DROP POLICY IF EXISTS reconciliation_submissions_write ON reconciliation_submissions;
DROP POLICY IF EXISTS reconciliation_lines_write ON reconciliation_lines;

CREATE POLICY reconciliation_submissions_write ON reconciliation_submissions
  FOR ALL TO authenticated
  USING (
    team_id IN (
      SELECT ut.team_id FROM user_teams ut WHERE ut.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM user_teams ut
      WHERE ut.user_id = auth.uid()
        AND ut.team_id = reconciliation_submissions.team_id
        AND lower(trim(ut.access_level)) NOT IN ('view', 'oht')
    )
    AND (
      scope IN ('team', 'all')
      OR user_id = auth.uid()
    )
  )
  WITH CHECK (
    team_id IN (
      SELECT ut.team_id FROM user_teams ut WHERE ut.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM user_teams ut
      WHERE ut.user_id = auth.uid()
        AND ut.team_id = reconciliation_submissions.team_id
        AND lower(trim(ut.access_level)) NOT IN ('view', 'oht')
    )
    AND created_by = auth.uid()
    AND (
      (scope = 'team' AND user_id IS NULL)
      OR (scope = 'all' AND user_id IS NULL)
      OR (scope = 'personal' AND user_id = auth.uid())
    )
  );

CREATE POLICY reconciliation_lines_write ON reconciliation_lines
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM reconciliation_submissions rs
      WHERE rs.id = reconciliation_lines.submission_id
        AND rs.is_deleted = false
        AND rs.team_id IN (
          SELECT ut.team_id FROM user_teams ut WHERE ut.user_id = auth.uid()
        )
        AND EXISTS (
          SELECT 1 FROM user_teams ut
          WHERE ut.user_id = auth.uid()
            AND ut.team_id = rs.team_id
            AND lower(trim(ut.access_level)) NOT IN ('view', 'oht')
        )
        AND (
          rs.scope IN ('team', 'all')
          OR rs.user_id = auth.uid()
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM reconciliation_submissions rs
      WHERE rs.id = reconciliation_lines.submission_id
        AND rs.created_by = auth.uid()
        AND rs.team_id IN (
          SELECT ut.team_id FROM user_teams ut WHERE ut.user_id = auth.uid()
        )
        AND EXISTS (
          SELECT 1 FROM user_teams ut
          WHERE ut.user_id = auth.uid()
            AND ut.team_id = rs.team_id
            AND lower(trim(ut.access_level)) NOT IN ('view', 'oht')
        )
        AND (
          rs.scope IN ('team', 'all')
          OR rs.user_id = auth.uid()
        )
    )
  );
