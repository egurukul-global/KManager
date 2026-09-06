-- ============================================================
-- 079_pending_budget_transfers_rpc.sql
-- Team leads must see PENDING budget-payment installments for their
-- team to activate the "Received" button. Budget-payment transfers
-- have no approval_request link, so the base transfers SELECT policy
-- hides them from team leads. This SECURITY DEFINER RPC returns the
-- pending amounts grouped by linked budget, bypassing RLS safely
-- (read-only aggregate, scoped to one team).
-- Run in Supabase SQL editor.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_pending_budget_transfers(p_team_id uuid)
RETURNS TABLE (linked_budget_id uuid, pending_usd numeric, transfer_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.linked_budget_id,
    SUM(COALESCE(t.dest_amount, t.amount, 0)) AS pending_usd,
    COUNT(*)::bigint AS transfer_count
  FROM public.transfers t
  WHERE t.dest_team_id = p_team_id
    AND t.status = 'PENDING'
    AND t.is_deleted = false
    AND t.flow_type IN ('org_to_team', 'oph_to_team')
    AND t.linked_budget_id IS NOT NULL
  GROUP BY t.linked_budget_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_pending_budget_transfers(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_pending_budget_transfers(uuid) FROM PUBLIC, anon;
