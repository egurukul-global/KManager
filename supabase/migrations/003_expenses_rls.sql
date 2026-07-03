-- Expenses RLS: members see/manage own rows; team lead/admin see all team rows.
-- Org roles (admin, caoh, oh, ceo) can access any team they belong to.

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS expenses_select ON expenses;
DROP POLICY IF EXISTS expenses_insert ON expenses;
DROP POLICY IF EXISTS expenses_update ON expenses;
DROP POLICY IF EXISTS expenses_delete ON expenses;

CREATE POLICY expenses_select ON expenses
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
          created_by = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM user_teams ut
            WHERE ut.user_id = auth.uid()
              AND ut.team_id = expenses.team_id
              AND ut.access_level IN ('lead', 'admin')
          )
        )
      )
    )
  );

CREATE POLICY expenses_insert ON expenses
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      EXISTS (
        SELECT 1 FROM users u
        WHERE u.id = auth.uid()
          AND u.role IN ('admin', 'caoh', 'oh', 'ceo')
      )
      OR team_id IN (
        SELECT ut.team_id
        FROM user_teams ut
        WHERE ut.user_id = auth.uid()
          AND ut.access_level IN ('member', 'lead', 'admin')
      )
    )
  );

CREATE POLICY expenses_update ON expenses
  FOR UPDATE TO authenticated
  USING (
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
        created_by = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM user_teams ut
          WHERE ut.user_id = auth.uid()
            AND ut.team_id = expenses.team_id
            AND ut.access_level IN ('lead', 'admin')
        )
      )
    )
  );

CREATE POLICY expenses_delete ON expenses
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'caoh', 'oh', 'ceo')
    )
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM user_teams ut
      WHERE ut.user_id = auth.uid()
        AND ut.team_id = expenses.team_id
        AND ut.access_level IN ('lead', 'admin')
    )
  );
