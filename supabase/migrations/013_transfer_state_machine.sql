-- Phase 1: Transfer state machine (PENDING / ACCEPTED / REJECTED) and ledger prep

ALTER TABLE transfers
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACCEPTED'
    CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED'));

ALTER TABLE transfers
  ADD COLUMN IF NOT EXISTS flow_type TEXT
    CHECK (flow_type IS NULL OR flow_type IN (
      'otl_operational',
      'otl_to_member',
      'otm_to_team',
      'otm_to_member'
    ));

ALTER TABLE transfers
  ADD COLUMN IF NOT EXISTS receiver_user_id UUID REFERENCES auth.users(id);

ALTER TABLE transfers
  ADD COLUMN IF NOT EXISTS receiver_kind TEXT
    CHECK (receiver_kind IS NULL OR receiver_kind IN ('member', 'otl'));

ALTER TABLE transfers
  ADD COLUMN IF NOT EXISTS dest_amount NUMERIC(18, 2);

ALTER TABLE transfers
  ADD COLUMN IF NOT EXISTS dest_currency TEXT;

ALTER TABLE transfers
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;

ALTER TABLE transfers
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;

ALTER TABLE transfers
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

-- Existing rows remain ACCEPTED (default)

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS balance_impact BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS linked_transfer_id UUID;

ALTER TABLE income
  ADD COLUMN IF NOT EXISTS balance_impact BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE income
  ADD COLUMN IF NOT EXISTS linked_transfer_id UUID;

CREATE INDEX IF NOT EXISTS idx_transfers_status_team
  ON transfers (team_id, status)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_transfers_receiver_pending
  ON transfers (receiver_user_id, status)
  WHERE status = 'PENDING' AND is_deleted = false;
