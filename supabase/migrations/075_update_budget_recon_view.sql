-- 075_update_budget_recon_view.sql
-- Add budget_name and team_name to budget_reconciliation_view

DROP VIEW IF EXISTS public.budget_reconciliation_view;

CREATE OR REPLACE VIEW public.budget_reconciliation_view AS
SELECT 
  bp.id AS budget_id,
  bp.name AS budget_name,
  bp.team_id,
  tm.name AS team_name,
  bp.total_amount AS approved_amount,
  
  -- Total transfers received against this budget (Allocated)
  COALESCE((
    SELECT SUM(t.dest_amount) 
    FROM public.transfers t 
    WHERE t.linked_budget_id = bp.id 
      AND t.status = 'ACCEPTED' 
      AND t.flow_type IN ('org_to_team', 'oph_to_team')
      AND t.is_deleted = false
  ), 0) AS allocated_amount,
  
  -- Total expenses logged against this budget
  COALESCE((
    SELECT SUM(e.usd_amount) 
    FROM public.expenses e 
    WHERE e.budget_id = bp.id 
      AND e.is_deleted = false
  ), 0) AS expenses_amount,
  
  -- Total unused funds returned to finance
  COALESCE((
    SELECT SUM(t.dest_amount) 
    FROM public.transfers t 
    WHERE t.linked_budget_id = bp.id 
      AND t.status = 'ACCEPTED' 
      AND t.flow_type = 'unused_funds_return'
      AND t.is_deleted = false
  ), 0) AS unused_funds_returned,
  
  -- Calculate current balance held by team
  (
    COALESCE((
      SELECT SUM(t.dest_amount) 
      FROM public.transfers t 
      WHERE t.linked_budget_id = bp.id 
        AND t.status = 'ACCEPTED' 
        AND t.flow_type IN ('org_to_team', 'oph_to_team')
        AND t.is_deleted = false
    ), 0) 
    - 
    COALESCE((
      SELECT SUM(e.usd_amount) 
      FROM public.expenses e 
      WHERE e.budget_id = bp.id 
        AND e.is_deleted = false
    ), 0) 
    -
    COALESCE((
      SELECT SUM(t.dest_amount) 
      FROM public.transfers t 
      WHERE t.linked_budget_id = bp.id 
        AND t.status = 'ACCEPTED' 
        AND t.flow_type = 'unused_funds_return'
        AND t.is_deleted = false
    ), 0)
  ) AS remaining_held_balance

FROM public.budget_plans bp
LEFT JOIN public.teams tm ON bp.team_id = tm.id
WHERE bp.is_deleted = false;

GRANT SELECT ON public.budget_reconciliation_view TO authenticated;
