-- ============================================================
-- 080_receive_budget_payment_rpc.sql
-- Per-record budget payment receipt flow (Income Manager).
-- Team leads see each PENDING budget-payment installment as a record
-- and accept them one by one. SECURITY DEFINER because budget-payment
-- transfers are hidden from team leads by the base transfers RLS.
-- Run in Supabase SQL editor.
-- ============================================================

-- 1. List pending budget-payment transfers for a team (one row per installment)
CREATE OR REPLACE FUNCTION public.get_pending_budget_payment_list(p_team_id uuid)
RETURNS TABLE (
  transfer_id uuid,
  transfer_date date,
  amount_usd numeric,
  budget_id uuid,
  budget_name text,
  budget_type text,
  payer text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id,
    t.date,
    COALESCE(t.dest_amount, t.amount, 0),
    bp.id,
    bp.name,
    bp.budget_type,
    COALESCE(ptm.name, 'KMOF / Finance'),
    t.created_at
  FROM public.transfers t
  LEFT JOIN public.budget_plans bp ON bp.id = t.linked_budget_id
  LEFT JOIN public.teams ptm ON ptm.id = t.team_id
  WHERE t.dest_team_id = p_team_id
    AND t.status = 'PENDING'
    AND t.is_deleted = false
    AND t.flow_type IN ('org_to_team', 'oph_to_team')
    AND t.linked_budget_id IS NOT NULL
  ORDER BY t.created_at ASC;
$$;

-- 2. Accept one budget-payment transfer: mark ACCEPTED, record income
--    allocated to the budget, and mark the budget received.
CREATE OR REPLACE FUNCTION public.accept_budget_payment_transfer(
  p_transfer_id uuid,
  p_bucket_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer public.transfers%ROWTYPE;
  v_bucket public.buckets%ROWTYPE;
  v_income_id uuid;
  v_amount numeric;
BEGIN
  SELECT * INTO v_transfer FROM public.transfers WHERE id = p_transfer_id AND is_deleted = false;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer not found';
  END IF;
  IF v_transfer.status IS DISTINCT FROM 'PENDING' THEN
    RAISE EXCEPTION 'Transfer is not pending';
  END IF;
  IF v_transfer.flow_type NOT IN ('org_to_team', 'oph_to_team') OR v_transfer.linked_budget_id IS NULL THEN
    RAISE EXCEPTION 'Transfer is not a budget payment';
  END IF;

  SELECT * INTO v_bucket FROM public.buckets WHERE id = p_bucket_id AND is_deleted = false;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bucket not found';
  END IF;
  IF v_bucket.team_id IS DISTINCT FROM v_transfer.dest_team_id THEN
    RAISE EXCEPTION 'Bucket does not belong to the receiving team';
  END IF;

  v_amount := COALESCE(v_transfer.dest_amount, v_transfer.amount, 0);
  v_income_id := gen_random_uuid();

  INSERT INTO public.income (
    id, team_id, date, payment_from, bucket_id, payment_bucket,
    amount_usd, currency, exchange_rate, local_amount,
    description, budget_allocations, created_by, is_deleted, updated_at
  ) VALUES (
    v_income_id,
    v_transfer.dest_team_id,
    COALESCE(v_transfer.date, CURRENT_DATE),
    'KMOF / Budget Funding',
    v_bucket.id,
    v_bucket.name,
    v_amount,
    COALESCE(v_bucket.currency, 'USD'),
    1,
    v_amount,
    'Received funding for budget payment installment',
    jsonb_build_array(jsonb_build_object('budget_id', v_transfer.linked_budget_id, 'amount_usd', v_amount)),
    COALESCE(p_user_id, auth.uid()),
    false,
    now()
  );

  UPDATE public.transfers
  SET status = 'ACCEPTED', accepted_at = now(), pending_step = null
  WHERE id = p_transfer_id;

  UPDATE public.budget_plans
  SET status = 'received'
  WHERE id = v_transfer.linked_budget_id;

  RETURN jsonb_build_object('ok', true, 'income_id', v_income_id, 'amount_usd', v_amount);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pending_budget_payment_list(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_budget_payment_transfer(uuid, uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_pending_budget_payment_list(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_budget_payment_transfer(uuid, uuid, uuid) FROM PUBLIC, anon;
