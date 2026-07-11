-- Phase 2: Named personal teams + cross-team transfer support

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS is_personal_team BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS personal_owner_user_id UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_teams_personal_owner
  ON teams (personal_owner_user_id)
  WHERE is_personal_team = true;

ALTER TABLE buckets
  ADD COLUMN IF NOT EXISTS is_protected BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE transfers
  ADD COLUMN IF NOT EXISTS dest_team_id UUID REFERENCES teams(id);

ALTER TABLE transfers
  ADD COLUMN IF NOT EXISTS pending_step TEXT
    CHECK (pending_step IS NULL OR pending_step IN ('ohf', 'receiver'));

ALTER TABLE transfers
  ADD COLUMN IF NOT EXISTS ohf_approved_at TIMESTAMPTZ;

ALTER TABLE transfers
  ADD COLUMN IF NOT EXISTS ohf_approved_by UUID REFERENCES auth.users(id);

ALTER TABLE transfers
  ADD COLUMN IF NOT EXISTS linked_budget_id UUID;

ALTER TABLE transfers DROP CONSTRAINT IF EXISTS transfers_flow_type_check;
ALTER TABLE transfers ADD CONSTRAINT transfers_flow_type_check
  CHECK (flow_type IS NULL OR flow_type IN (
    'otl_operational',
    'otl_to_member',
    'otm_to_team',
    'otm_to_member',
    'cross_team_personal'
  ));

CREATE INDEX IF NOT EXISTS idx_transfers_ohf_pending
  ON transfers (status, pending_step)
  WHERE status = 'PENDING' AND pending_step = 'ohf' AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_transfers_dest_team
  ON transfers (dest_team_id)
  WHERE is_deleted = false;
