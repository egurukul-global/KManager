-- Unified daily reconciliation: one submission per team per day (scope = 'all')
ALTER TABLE reconciliation_submissions DROP CONSTRAINT IF EXISTS reconciliation_submissions_scope_check;

ALTER TABLE reconciliation_submissions ADD CONSTRAINT reconciliation_submissions_scope_check
  CHECK (scope IN ('team', 'personal', 'all'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_recon_submission_all_daily
  ON reconciliation_submissions (team_id, reconciliation_date)
  WHERE scope = 'all' AND is_deleted = false;
