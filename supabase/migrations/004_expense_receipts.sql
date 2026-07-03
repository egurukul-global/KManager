-- Generated expense receipts (standalone; image_url for future cloud storage phase)

CREATE TABLE IF NOT EXISTS expense_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL,
  receipt_number TEXT NOT NULL,
  receipt_date DATE NOT NULL,
  vendor TEXT,
  location TEXT,
  currency TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  tax_percent NUMERIC(12, 4) DEFAULT 0,
  tax_amount NUMERIC(12, 2) DEFAULT 0,
  discount NUMERIC(12, 2) DEFAULT 0,
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  grand_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  receipt_hash TEXT,
  image_url TEXT,
  expense_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  is_deleted BOOLEAN DEFAULT false,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT expense_receipts_team_number_unique UNIQUE (team_id, receipt_number)
);

CREATE INDEX IF NOT EXISTS idx_expense_receipts_team_date
  ON expense_receipts (team_id, receipt_date DESC);

ALTER TABLE expense_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS expense_receipts_select ON expense_receipts;
DROP POLICY IF EXISTS expense_receipts_insert ON expense_receipts;
DROP POLICY IF EXISTS expense_receipts_update ON expense_receipts;
DROP POLICY IF EXISTS expense_receipts_delete ON expense_receipts;

CREATE POLICY expense_receipts_select ON expense_receipts
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
              AND ut.team_id = expense_receipts.team_id
              AND ut.access_level IN ('lead', 'admin')
          )
        )
      )
    )
  );

CREATE POLICY expense_receipts_insert ON expense_receipts
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

CREATE POLICY expense_receipts_update ON expense_receipts
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
            AND ut.team_id = expense_receipts.team_id
            AND ut.access_level IN ('lead', 'admin')
        )
      )
    )
  );

CREATE POLICY expense_receipts_delete ON expense_receipts
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
        AND ut.team_id = expense_receipts.team_id
        AND ut.access_level IN ('lead', 'admin')
    )
  );
