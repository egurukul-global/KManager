-- Allow unified reconciliation (scope = 'all') in RLS policies.
-- Migration 007 added the scope value but 005 policies only allowed team/personal.

DROP POLICY IF EXISTS reconciliation_submissions_select ON reconciliation_submissions;
DROP POLICY IF EXISTS reconciliation_submissions_write ON reconciliation_submissions;
DROP POLICY IF EXISTS reconciliation_lines_select ON reconciliation_lines;
DROP POLICY IF EXISTS reconciliation_lines_write ON reconciliation_lines;

CREATE POLICY reconciliation_submissions_select ON reconciliation_submissions
  FOR SELECT TO authenticated
  USING (
    is_deleted = false
    AND (
      EXISTS (
        SELECT 1 FROM users u
        WHERE u.id = auth.uid()
          AND u.role IN ('admin', 'caoh', 'oh', 'ceo')
      )
      OR (
        team_id IN (
          SELECT ut.team_id FROM user_teams ut WHERE ut.user_id = auth.uid()
        )
        AND (
          scope IN ('team', 'all')
          OR user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM user_teams ut
            WHERE ut.user_id = auth.uid()
              AND ut.team_id = reconciliation_submissions.team_id
              AND ut.access_level IN ('lead', 'admin')
          )
        )
      )
    )
  );

CREATE POLICY reconciliation_submissions_write ON reconciliation_submissions
  FOR ALL TO authenticated
  USING (
    team_id IN (
      SELECT ut.team_id FROM user_teams ut WHERE ut.user_id = auth.uid()
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
    AND created_by = auth.uid()
    AND (
      (scope = 'team' AND user_id IS NULL)
      OR (scope = 'all' AND user_id IS NULL)
      OR (scope = 'personal' AND user_id = auth.uid())
    )
  );

CREATE POLICY reconciliation_lines_select ON reconciliation_lines
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM reconciliation_submissions rs
      WHERE rs.id = reconciliation_lines.submission_id
        AND rs.is_deleted = false
        AND (
          EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid()
              AND u.role IN ('admin', 'caoh', 'oh', 'ceo')
          )
          OR (
            rs.team_id IN (
              SELECT ut.team_id FROM user_teams ut WHERE ut.user_id = auth.uid()
            )
            AND (
              rs.scope IN ('team', 'all')
              OR rs.user_id = auth.uid()
              OR EXISTS (
                SELECT 1 FROM user_teams ut
                WHERE ut.user_id = auth.uid()
                  AND ut.team_id = rs.team_id
                  AND ut.access_level IN ('lead', 'admin')
              )
            )
          )
        )
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
        AND (
          rs.scope IN ('team', 'all')
          OR rs.user_id = auth.uid()
        )
    )
  );
