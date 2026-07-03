-- Daily bucket-level reconciliation (team + personal scope)
-- Replaces the notes-only daily_reconciliation workflow for Financial Status.

-- Personal buckets: owner_user_id set; team buckets: owner_user_id IS NULL
ALTER TABLE buckets ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_buckets_owner
  ON buckets (team_id, owner_user_id)
  WHERE is_deleted = false;

-- =============================================================================
-- Reconciliation submissions (one per team/day; one per user/day for personal)
-- =============================================================================
CREATE TABLE IF NOT EXISTS reconciliation_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL,
  reconciliation_date DATE NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('team', 'personal')),
  user_id UUID REFERENCES auth.users(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT reconciliation_personal_requires_user
    CHECK (scope <> 'personal' OR user_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_recon_submission_team_daily
  ON reconciliation_submissions (team_id, reconciliation_date)
  WHERE scope = 'team' AND is_deleted = false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_recon_submission_personal_daily
  ON reconciliation_submissions (team_id, reconciliation_date, user_id)
  WHERE scope = 'personal' AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_recon_submissions_team_date
  ON reconciliation_submissions (team_id, reconciliation_date DESC)
  WHERE is_deleted = false;

-- =============================================================================
-- Per-bucket reconciliation lines
-- =============================================================================
CREATE TABLE IF NOT EXISTS reconciliation_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES reconciliation_submissions(id) ON DELETE CASCADE,
  bucket_id UUID NOT NULL,
  bucket_name TEXT NOT NULL,
  currency TEXT NOT NULL,
  opening_balance NUMERIC(18, 2) DEFAULT 0,
  income_amount NUMERIC(18, 2) DEFAULT 0,
  transfers_in NUMERIC(18, 2) DEFAULT 0,
  expenses_amount NUMERIC(18, 2) DEFAULT 0,
  transfers_out NUMERIC(18, 2) DEFAULT 0,
  closing_balance NUMERIC(18, 2) NOT NULL,
  actual_balance NUMERIC(18, 2),
  difference NUMERIC(18, 2),
  usd_equivalent NUMERIC(18, 2),
  comments TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recon_lines_submission
  ON reconciliation_lines (submission_id);

-- =============================================================================
-- RLS
-- =============================================================================
ALTER TABLE reconciliation_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_lines ENABLE ROW LEVEL SECURITY;

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
          scope = 'team'
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
      scope = 'team'
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
              rs.scope = 'team'
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
          rs.scope = 'team'
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
          rs.scope = 'team'
          OR rs.user_id = auth.uid()
        )
    )
  );
