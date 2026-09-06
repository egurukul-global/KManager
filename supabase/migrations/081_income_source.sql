-- ============================================================
-- 081_income_source.sql
-- Data-driven distinction between system-generated budget payment
-- income (immutable) and manually entered income (editable).
-- Run in Supabase SQL editor.
-- ============================================================
ALTER TABLE public.income ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';

-- Back-fill: budget funding income created by the receive flows
UPDATE public.income
SET source = 'budget_payment'
WHERE source IS NULL OR source = ''
  OR payment_from = 'KMOF / Budget Funding'
  OR description ILIKE 'Received funding for budget%';

-- Mark future RPC-created income
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
    description, budget_allocations, created_by, is_deleted, updated_at, source
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
    now(),
    'budget_payment'
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

GRANT EXECUTE ON FUNCTION public.accept_budget_payment_transfer(uuid, uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.accept_budget_payment_transfer(uuid, uuid, uuid) FROM PUBLIC, anon;
