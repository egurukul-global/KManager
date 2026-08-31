-- 072_budget_reconciliation.sql
-- Create budget reconciliation view and unused funds logic

-- Create a virtual/system bucket type for UNUSED_FUNDS if it doesn't exist
ALTER TABLE buckets
  ADD COLUMN IF NOT EXISTS is_system_bucket BOOLEAN NOT NULL DEFAULT false;

-- Create dynamic view for real-time budget reconciliation
CREATE OR REPLACE VIEW budget_reconciliation_view AS
SELECT 
  bp.id AS budget_id,
  bp.team_id,
  bp.total_amount AS approved_amount,
  
  -- Total transfers received against this budget (Allocated)
  COALESCE((
    SELECT SUM(t.dest_amount) 
    FROM transfers t 
    WHERE t.linked_budget_id = bp.id 
      AND t.status = 'ACCEPTED' 
      AND t.flow_type IN ('org_to_team', 'oph_to_team')
      AND t.is_deleted = false
  ), 0) AS allocated_amount,
  
  -- Total expenses logged against this budget
  COALESCE((
    SELECT SUM(e.usd_amount) 
    FROM expenses e 
    WHERE e.budget_id = bp.id 
      AND e.is_deleted = false
  ), 0) AS expenses_amount,
  
  -- Total unused funds returned to finance
  COALESCE((
    SELECT SUM(t.dest_amount) 
    FROM transfers t 
    WHERE t.linked_budget_id = bp.id 
      AND t.status = 'ACCEPTED' 
      AND t.flow_type = 'unused_funds_return'
      AND t.is_deleted = false
  ), 0) AS unused_funds_returned,
  
  -- Calculate current balance held by team
  (
    COALESCE((
      SELECT SUM(t.dest_amount) 
      FROM transfers t 
      WHERE t.linked_budget_id = bp.id 
        AND t.status = 'ACCEPTED' 
        AND t.flow_type IN ('org_to_team', 'oph_to_team')
        AND t.is_deleted = false
    ), 0) 
    - 
    COALESCE((
      SELECT SUM(e.usd_amount) 
      FROM expenses e 
      WHERE e.budget_id = bp.id 
        AND e.is_deleted = false
    ), 0) 
    -
    COALESCE((
      SELECT SUM(t.dest_amount) 
      FROM transfers t 
      WHERE t.linked_budget_id = bp.id 
        AND t.status = 'ACCEPTED' 
        AND t.flow_type = 'unused_funds_return'
        AND t.is_deleted = false
    ), 0)
  ) AS remaining_held_balance

FROM budget_plans bp
WHERE bp.is_deleted = false;
