-- Migration 070: Secure Budget Plans State Changes
-- Prevents creators/normal users from directly patching workflow-controlled fields
-- (approval_status, paid_amount, funding_notes) to bypass the approval workflow.

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
  -- Resolve authenticated user's role
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

  -- Check if workflow-controlled fields are modified
  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status OR
     NEW.paid_amount IS DISTINCT FROM OLD.paid_amount OR
     NEW.funding_notes IS DISTINCT FROM OLD.funding_notes THEN

    -- Only apply restrictions for non-administrators
    IF NOT v_is_admin THEN
      -- Fetch the latest active approval request for this budget
      SELECT * INTO v_req FROM public.approval_requests 
      WHERE budget_plan_id = NEW.id AND is_deleted = false 
      ORDER BY created_at DESC LIMIT 1;

      -- 1. approval_status validation
      IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
        IF NEW.approval_status = 'SUBMITTED' AND OLD.approval_status IN ('DRAFT', 'REJECTED', 'CLARIFY-OPL') THEN
          -- Verify an active request exists with matching status
          IF v_req IS NULL OR v_req.approval_status IS DISTINCT FROM 'SUBMITTED' THEN
            -- Check if request was created in the same transaction context
            SELECT * INTO v_req FROM public.approval_requests 
            WHERE budget_plan_id = NEW.id AND is_deleted = false AND created_at >= now() - interval '2 seconds'
            ORDER BY created_at DESC LIMIT 1;
            
            IF v_req IS NULL THEN
              RAISE EXCEPTION 'Cannot submit budget plan without an active approval request.';
            END IF;
          END IF;
        ELSIF NEW.approval_status = 'DRAFT' THEN
          IF v_req IS NOT NULL AND v_req.approval_status NOT IN ('REJECTED', 'CANCELLED', 'DRAFT') THEN
            RAISE EXCEPTION 'Cannot reset budget to DRAFT unless the workflow request is rejected or cancelled.';
          END IF;
        ELSE
          -- For all other status updates, require that the status matches the validated approval request
          IF v_req IS NULL THEN
            RAISE EXCEPTION 'No active approval request found for this budget plan.';
          END IF;
          
          IF NEW.approval_status IS DISTINCT FROM v_req.approval_status THEN
            RAISE EXCEPTION 'Direct approval status modification is forbidden. Status must be updated through the approval workflow.';
          END IF;
        END IF;
      END IF;

      -- 2. paid_amount or funding_notes validation
      IF NEW.paid_amount IS DISTINCT FROM OLD.paid_amount OR
         NEW.funding_notes IS DISTINCT FROM OLD.funding_notes THEN
        IF v_req IS NULL THEN
          RAISE EXCEPTION 'Cannot record payment details: No active approval request found.';
        END IF;

        -- Verify that the caller is authorized to act on the request at the current step
        -- and that the active workflow step role is a payment role (FIP or FIH)
        IF NOT (
          public.user_can_act_on_approval_request(v_req.id) 
          AND upper(coalesce(v_req.current_role_code, '')) IN ('FIP', 'FIH')
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
