-- Fix trigger function for budget_plans to remove non-existent columns (currency, exchange_rate)
-- and align status check with the uppercase approval_status field.

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
BEGIN
  -- Resolve authenticated user's role
  SELECT role INTO v_user_role FROM public.users WHERE id = auth.uid();
  v_is_admin := (v_user_role = 'admin');

  -- Bypass all restrictions for system administrators
  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  -- Verify total_amount matches sum of categories USD amounts
  IF NEW.categories IS NOT NULL THEN
    FOR v_cat IN SELECT * FROM jsonb_array_elements(NEW.categories) LOOP
      v_sum_usd := v_sum_usd + COALESCE((v_cat->>'usdAmount')::numeric, (v_cat->>'usd_amount')::numeric, 0);
    END LOOP;
    
    IF ABS(NEW.total_amount - v_sum_usd) > 0.02 THEN
      RAISE EXCEPTION 'Total budget amount (%) does not match the sum of category line items (%)', NEW.total_amount, v_sum_usd;
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
      RAISE EXCEPTION 'Budget is currently locked under workflow status (%) and cannot be modified', OLD.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
