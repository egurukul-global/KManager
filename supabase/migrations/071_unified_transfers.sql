-- 071_unified_transfers.sql
-- Expand transfers table for budget tracking, Org-Level buckets, and exchange rates.

-- Ensure budget tracking fields
ALTER TABLE transfers
  ADD COLUMN IF NOT EXISTS linked_budget_id UUID REFERENCES budget_plans(id);

-- Support for Org-Level buckets. Add flag to buckets table.
ALTER TABLE buckets
  ADD COLUMN IF NOT EXISTS is_org_level BOOLEAN NOT NULL DEFAULT false;

-- Enhance flow_type to support new organizational transfer flows
ALTER TABLE transfers
  DROP CONSTRAINT IF EXISTS transfers_flow_type_check;

ALTER TABLE transfers
  ADD CONSTRAINT transfers_flow_type_check 
  CHECK (flow_type IS NULL OR flow_type IN (
    'otl_operational',
    'otl_to_member',
    'otm_to_team',
    'otm_to_member',
    'org_to_team',
    'team_to_org',
    'org_to_oph',
    'oph_to_team',
    'unused_funds_return'
  ));

-- Add exchange rate tracking for dual-currency support
ALTER TABLE transfers
  ADD COLUMN IF NOT EXISTS exchange_rate_approval NUMERIC(15, 6),
  ADD COLUMN IF NOT EXISTS exchange_rate_disbursement NUMERIC(15, 6);

-- Optional notes/justification field
ALTER TABLE transfers
  ADD COLUMN IF NOT EXISTS payment_notes TEXT;

-- Create an index for quick lookup of transfers related to a specific budget
CREATE INDEX IF NOT EXISTS idx_transfers_linked_budget
  ON transfers (linked_budget_id)
  WHERE is_deleted = false AND linked_budget_id IS NOT NULL;
