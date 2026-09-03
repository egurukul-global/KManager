-- ================================================================
-- Migration 071: Budget payment flow changes
-- 1) Remove FIP (step 6) from the budget approval flow - payment now
--    happens in the Transfer Funds module, not the approval flow.
-- 2) FIH step 5 becomes the final approval step.
-- 3) Add budget_plans.approved_amount (FIH's authorized amount).
-- 4) Update enforce_budget_plans_integrity: protect approved_amount,
--    and allow FIH/FIP to record payments against COMPLETED
--    (FIH-APPROVED) requests from the payment/transfer module.
-- ================================================================

-- ----------------------------------------------------------------
-- 1) Flow steps: FIP out, FIH final
-- ----------------------------------------------------------------
UPDATE public.approval_flow_steps
SET is_final = true
WHERE step_order = 5
  AND upper(role_code) = 'FIH'
  AND flow_id IN (SELECT id FROM public.approval_flow_definitions WHERE request_type = 'budget');

DELETE FROM public.approval_flow_steps
WHERE step_order = 6
  AND upper(role_code) = 'FIP'
  AND flow_id IN (SELECT id FROM public.approval_flow_definitions WHERE request_type = 'budget');

-- ----------------------------------------------------------------
-- 2) approved_amount column
-- ----------------------------------------------------------------
ALTER TABLE public.budget_plans
  ADD COLUMN IF NOT EXISTS approved_amount NUMERIC(14, 2);

-- ----------------------------------------------------------------
-- 3) Integrity trigger (rebuilt from 070 with approved_amount rules)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_budget_plans_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_role text;
  v_is_admin boolean := false;
  v_sum_usd numeric := 0;
  v_cat jsonb;
  v_req record;
BEGIN
  SELECT role INTO v_user_role FROM public.users WHERE id = auth.uid();
  v_is_admin := (v_user_role = 'admin');

  -- Verify total_amount matches sum of categories USD amounts
  IF NEW.categories IS NOT NULL THEN
    FOR v_cat IN SELECT * FROM jsonb_array_elements(NEW.categories) LOOP
      v_sum_usd := v_sum_usd + COALESCE((v_cat->>'usdAmount')::numeric, (v_cat->>'usd_amount')::numeric, 0);
    END LOOP;
    IF ABS(NEW.total_amount - v_sum_usd) > 0.02 THEN
      RAISE EXCEPTION 'Total budget amount (%) does not match the sum of category line items (%)', NEW.total_amount, v_sum_usd;
    END IF;
  END IF;

  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status OR
     NEW.paid_amount IS DISTINCT FROM OLD.paid_amount OR
     NEW.approved_amount IS DISTINCT FROM OLD.approved_amount OR
     NEW.funding_notes IS DISTINCT FROM OLD.funding_notes THEN

    IF NOT v_is_admin THEN
      SELECT * INTO v_req FROM public.approval_requests
      WHERE budget_plan_id = NEW.id AND is_deleted = false
      ORDER BY created_at DESC LIMIT 1;

      -- 1. approval_status validation (same rules as migration 070)
      IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
        IF NEW.approval_status = 'SUBMITTED' AND OLD.approval_status IN ('DRAFT', 'REJECTED', 'CLARIFY-OPL') THEN
          IF v_req IS NULL OR v_req.status IS DISTINCT FROM 'SUBMITTED' THEN
            SELECT * INTO v_req FROM public.approval_requests
            WHERE budget_plan_id = NEW.id AND is_deleted = false AND created_at >= now() - interval '2 seconds'
            ORDER BY created_at DESC LIMIT 1;
            IF v_req IS NULL THEN
              RAISE EXCEPTION 'Cannot submit budget plan without an active approval request.';
            END IF;
          END IF;
        ELSIF NEW.approval_status = 'DRAFT' THEN
          IF v_req IS NOT NULL AND v_req.status NOT IN ('REJECTED', 'CANCELLED', 'DRAFT') THEN
            RAISE EXCEPTION 'Cannot reset budget to DRAFT unless the workflow request is rejected or cancelled.';
          END IF;
        ELSE
          IF v_req IS NULL THEN
            RAISE EXCEPTION 'No active approval request found for this budget plan.';
          END IF;
          IF NEW.approval_status IS DISTINCT FROM v_req.status THEN
            RAISE EXCEPTION 'Direct approval status modification is forbidden. Status must be updated through the approval workflow.';
          END IF;
        END IF;
      END IF;

      -- 2. approved_amount: only the FIH final-approval step may set it
      IF NEW.approved_amount IS DISTINCT FROM OLD.approved_amount THEN
        IF v_req IS NULL THEN
          RAISE EXCEPTION 'Cannot record approved amount: No approval request found.';
        END IF;
        IF NOT (
          public.user_can_act_on_approval_request(v_req.id)
          AND upper(coalesce(v_req.current_role_code, '')) IN ('FIH', 'FIP')
        ) THEN
          RAISE EXCEPTION 'Unauthorized to set the approved amount for this budget.';
        END IF;
      END IF;

      -- 3. paid_amount / funding_notes: payment roles, either acting at the
      --    current step OR recording a payment against a COMPLETED
      --    (FIH-APPROVED) request via the Transfer Funds payment module.
      IF NEW.paid_amount IS DISTINCT FROM OLD.paid_amount OR
         NEW.funding_notes IS DISTINCT FROM OLD.funding_notes THEN
        IF v_req IS NULL THEN
          RAISE EXCEPTION 'Cannot record payment details: No approval request found.';
        END IF;
        IF NOT (
          (
            public.user_can_act_on_approval_request(v_req.id)
            AND upper(coalesce(v_req.current_role_code, '')) IN ('FIP', 'FIH')
          )
          OR
          (
            upper(coalesce(v_req.status, '')) LIKE '%-APPROVED'
            AND (
              public.user_has_approval_role(auth.uid(), 'FIH', v_req.team_id)
              OR public.user_has_approval_role(auth.uid(), 'FIP', v_req.team_id)
            )
          )
        ) THEN
          RAISE EXCEPTION 'Unauthorized to modify payment details for this request.';
        END IF;
      END IF;
    END IF;
  END IF;

  -- If status is NOT Draft/Rejected/Clarify, lock financial and calendar details
  IF OLD.approval_status IS NOT NULL AND OLD.approval_status NOT IN ('DRAFT', 'REJECTED', 'CLARIFY-OPL') THEN
    IF OLD.categories IS DISTINCT FROM NEW.categories OR
       OLD.total_amount IS DISTINCT FROM NEW.total_amount OR
       OLD.name IS DISTINCT FROM NEW.name OR
       OLD.team_id IS DISTINCT FROM NEW.team_id OR
       OLD.budget_type IS DISTINCT FROM NEW.budget_type OR
       OLD.calendar_entry_id IS DISTINCT FROM NEW.calendar_entry_id OR
       OLD.budget_period_date IS DISTINCT FROM NEW.budget_period_date THEN
      RAISE EXCEPTION 'Budget is currently locked under workflow status (%) and cannot be modified', OLD.approval_status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


-- ----------------------------------------------------------------
-- 5) transfers: allow finance payment roles to create transfers
--    (org->team budget payments done via the "Pay Approved Budget" card)
--    Uses a SECURITY DEFINER RPC (runs as table owner, bypasses RLS)
--    and validates the caller's finance role explicitly. This avoids
--    the repeated RLS WITH CHECK denials on org->team inserts.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.insert_budget_payment_transfer(
  p_id uuid,
  p_team_id uuid,
  p_dest_team_id uuid,
  p_date date,
  p_from_bucket_id uuid,
  p_to_bucket_id uuid,
  p_amount numeric,
  p_rate numeric,
  p_currency text,
  p_dest_amount numeric,
  p_dest_currency text,
  p_description text,
  p_receiver_user_id uuid,
  p_linked_budget_id uuid,
  p_attachment_url text,
  p_attachment_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_authorized boolean;
  v_row transfers%ROWTYPE;
BEGIN
  -- Only finance/payment/org-admin roles may create payment transfers
  SELECT (
    public.is_org_admin()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('fih','fip','fin','cao','caoh','oh','ceo','admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.app_role_assignments a
      WHERE a.user_id = auth.uid()
        AND a.app_code IN ('finance','ok')
        AND a.team_id IS NULL
    )
  ) INTO v_authorized;

  IF NOT coalesce(v_authorized, false) THEN
    RAISE EXCEPTION 'Unauthorized: finance payment access required to create a payment transfer';
  END IF;

  INSERT INTO public.transfers (
    id, team_id, dest_team_id, date, from_bucket_id, to_bucket_id,
    amount, rate, currency, dest_amount, dest_currency, description,
    status, flow_type, receiver_user_id, receiver_kind, pending_step,
    linked_budget_id, attachment_url, attachment_name,
    created_by, created_at, is_deleted
  ) VALUES (
    p_id, p_team_id, p_dest_team_id, p_date, p_from_bucket_id, p_to_bucket_id,
    p_amount, coalesce(p_rate, 1), p_currency, p_dest_amount, p_dest_currency, p_description,
    'PENDING', 'org_to_team', p_receiver_user_id, 'otl', 'receiver',
    p_linked_budget_id, p_attachment_url, p_attachment_name,
    auth.uid(), now(), false
  )
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

GRANT EXECUTE ON FUNCTION public.insert_budget_payment_transfer(uuid, uuid, uuid, date, uuid, uuid, numeric, numeric, text, numeric, text, text, uuid, uuid, text, text) TO authenticated;

-- Also allow finance payment roles to insert transfers (belt-and-braces,
-- in case any frontend still uses a direct .insert)
DO $$
BEGIN
  DROP POLICY IF EXISTS "Finance payment roles can insert transfers" ON transfers;
  CREATE POLICY "Finance payment roles can insert transfers"
  ON transfers
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_admin()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('fih', 'fip', 'fin', 'cao', 'caoh', 'oh', 'ceo', 'admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.app_role_assignments a
      WHERE a.user_id = auth.uid()
        AND a.app_code IN ('finance', 'ok')
        AND a.team_id IS NULL
    )
  );
  RAISE NOTICE 'OK: transfers finance payment insert policy';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'FAILED (transfers insert): % (%)', SQLERRM, SQLSTATE;
END $$;

-- Finance payment roles can view all transfers (budget payment transfers have no approval_request link,
-- so the transfers_select_approval_assignee policy alone would hide them from everyone, including FIH)
DO $$
BEGIN
  DROP POLICY IF EXISTS "Finance payment roles can view transfers" ON transfers;
  CREATE POLICY "Finance payment roles can view transfers"
    ON transfers
    FOR SELECT TO authenticated
    USING (
      public.is_org_admin()
      OR EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid()
          AND u.role IN ('fih', 'fip', 'fin', 'cao', 'caoh', 'oh', 'ceo', 'admin')
      )
      OR EXISTS (
        SELECT 1 FROM public.app_role_assignments a
        WHERE a.user_id = auth.uid()
          AND a.app_code IN ('finance', 'ok')
          AND a.team_id IS NULL
      )
    );
  RAISE NOTICE 'OK: transfers finance payment select policy';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'FAILED (transfers select): % (%)', SQLERRM, SQLSTATE;
END $$;
ALTER TABLE public.transfers ADD COLUMN IF NOT EXISTS attachment_url TEXT;
ALTER TABLE public.transfers ADD COLUMN IF NOT EXISTS attachment_name TEXT;

