-- Migration 067: Secure Approval and Budget Workflow Triggers
-- Enforces state-machine validation, column-level restrictions, and workflow progression at the database layer.

-- 1. Create Helper Function to resolve next active workflow step (incorporating segregation of duties)
CREATE OR REPLACE FUNCTION public.get_next_active_workflow_step(
  p_request_type text,
  p_team_id uuid,
  p_creator_id uuid,
  p_current_step_order integer
)
RETURNS TABLE (
  step_order integer,
  role_code text,
  is_approved boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_flow_id uuid;
  v_step record;
  v_found boolean := false;
  v_creator_has_role boolean;
BEGIN
  -- Find active flow definition
  SELECT f.id INTO v_flow_id
  FROM public.approval_flow_definitions f
  WHERE f.request_type = p_request_type
    AND (f.team_id IS NULL OR f.team_id = p_team_id)
    AND f.is_active = true
  ORDER BY (f.team_id IS NOT NULL) DESC, f.priority DESC
  LIMIT 1;

  IF v_flow_id IS NULL THEN
    RETURN;
  END IF;

  -- Find next step in flow steps order
  FOR v_step IN 
    SELECT s.step_order, s.role_code
    FROM public.approval_flow_steps s
    WHERE s.flow_id = v_flow_id
      AND (p_current_step_order IS NULL OR s.step_order > p_current_step_order)
    ORDER BY s.step_order ASC
  LOOP
    -- Check if creator has the role code (segregation of duties)
    v_creator_has_role := public.user_has_approval_role(p_creator_id, v_step.role_code, p_team_id);
    IF NOT v_creator_has_role THEN
      step_order := v_step.step_order;
      role_code := v_step.role_code;
      is_approved := false;
      v_found := true;
      RETURN NEXT;
      RETURN;
    END IF;
  END LOOP;

  -- If no steps remain, it is auto-approved
  IF NOT v_found THEN
    step_order := NULL;
    role_code := NULL;
    is_approved := true;
    RETURN NEXT;
  END IF;
END;
$$;

-- 2. Create Trigger Function for approval_requests
CREATE OR REPLACE FUNCTION public.enforce_approval_requests_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_role text;
  v_is_admin boolean := false;
  v_next_step record;
BEGIN
  -- Resolve authenticated user's role
  SELECT role INTO v_user_role FROM public.users WHERE id = auth.uid();
  v_is_admin := (v_user_role = 'admin');

  -- Bypass all restrictions for system administrators (emergency override)
  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  -- ── IMMUTABLE FIELDS (All non-admins) ──────────────────────────────────────
  IF OLD.id IS DISTINCT FROM NEW.id OR
     OLD.request_number IS DISTINCT FROM NEW.request_number OR
     OLD.request_type IS DISTINCT FROM NEW.request_type OR
     OLD.created_by IS DISTINCT FROM NEW.created_by OR
     OLD.team_id IS DISTINCT FROM NEW.team_id OR
     OLD.budget_plan_id IS DISTINCT FROM NEW.budget_plan_id OR
     OLD.transfer_id IS DISTINCT FROM NEW.transfer_id OR
     OLD.reconciliation_submission_id IS DISTINCT FROM NEW.reconciliation_submission_id THEN
    RAISE EXCEPTION 'Immutable fields cannot be modified';
  END IF;

  -- ── WORKFLOW STATE MACHINE VALIDATION ──────────────────────────────────────
  
  -- Prevent modifications to completed/terminal requests
  IF OLD.status IN ('PAID', 'RECEIVED', 'APPROVED', 'REJECTED') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Request is already in a terminal state (%) and cannot be updated', OLD.status;
  END IF;

  -- Case A: Creator is performing the update
  IF OLD.created_by = auth.uid() THEN
    -- Submission transition: DRAFT -> SUBMITTED (or auto-approved state)
    IF OLD.status = 'DRAFT' AND NEW.status IS DISTINCT FROM 'DRAFT' THEN
      SELECT * INTO v_next_step FROM public.get_next_active_workflow_step(OLD.request_type, OLD.team_id, OLD.created_by, NULL);
      
      IF v_next_step.is_approved THEN
        -- Auto-approved scenario
        IF NEW.status NOT LIKE '%-APPROVED' OR NEW.completed_at IS NULL THEN
          RAISE EXCEPTION 'Auto-approved transition requires status to be approved and completed_at to be populated';
        END IF;
      ELSE
        -- Standard submission
        IF NEW.status IS DISTINCT FROM 'SUBMITTED' OR
           NEW.current_step_order IS DISTINCT FROM v_next_step.step_order OR
           NEW.current_role_code IS DISTINCT FROM v_next_step.role_code OR
           NEW.completed_at IS NOT NULL OR
           NEW.step_approved = true THEN
          RAISE EXCEPTION 'Invalid initial workflow step. Expected step %, role %', v_next_step.step_order, v_next_step.role_code;
        END IF;
      END IF;
      RETURN NEW;
    END IF;

    -- Local edits inside DRAFT status
    IF OLD.status = 'DRAFT' AND NEW.status = 'DRAFT' THEN
      -- Creator cannot pre-set workflow columns during DRAFT updates
      IF NEW.current_step_order IS NOT NULL OR
         NEW.current_role_code IS NOT NULL OR
         NEW.step_approved = true OR
         NEW.completed_at IS NOT NULL THEN
        RAISE EXCEPTION 'Workflow columns must remain null/default in DRAFT status';
      END IF;
      RETURN NEW;
    END IF;

    -- If request is active (non-DRAFT), creator can only Cancel or Resubmit replies
    IF NEW.status = 'DRAFT' THEN
      -- Cancellation: verify it resets workflow fields cleanly
      IF NEW.current_step_order IS NOT NULL OR NEW.current_role_code IS NOT NULL OR NEW.step_approved = true OR NEW.completed_at IS NOT NULL THEN
        RAISE EXCEPTION 'Cancelling a request must reset workflow step fields to null/default';
      END IF;
      -- Block changing business details during cancellation
      IF OLD.amount_usd IS DISTINCT FROM NEW.amount_usd OR OLD.title IS DISTINCT FROM NEW.title THEN
        RAISE EXCEPTION 'Cannot modify title or amount_usd during request cancellation';
      END IF;
      RETURN NEW;
    ELSIF OLD.status LIKE 'CLARIFY-%' AND NEW.status = 'SUBMITTED' THEN
      -- Reply to clarification
      IF OLD.amount_usd IS DISTINCT FROM NEW.amount_usd OR OLD.title IS DISTINCT FROM NEW.title THEN
        RAISE EXCEPTION 'Cannot modify title or amount_usd during clarification reply';
      END IF;
      RETURN NEW;
    ELSE
      RAISE EXCEPTION 'Creators cannot modify active workflow requests (current status: %)', OLD.status;
    END IF;
  END IF;

  -- Case B: Approver / Reviewer is performing the update
  -- Must have permission for the current step order/role
  IF NOT public.user_can_act_on_approval_request(OLD.id) THEN
    RAISE EXCEPTION 'You are not authorized to act on this request at the current step (%)', OLD.status;
  END IF;

  -- Approvers may only change workflow columns
  IF OLD.title IS DISTINCT FROM NEW.title OR
     OLD.amount_usd IS DISTINCT FROM NEW.amount_usd OR
     OLD.is_deleted IS DISTINCT FROM NEW.is_deleted THEN
    RAISE EXCEPTION 'Approvers are not permitted to modify request details (title, amount_usd, is_deleted)';
  END IF;

  -- Validate transition correctness (prevent skips)
  -- 1. Advancing the step
  IF NEW.current_step_order IS DISTINCT FROM OLD.current_step_order OR NEW.current_role_code IS DISTINCT FROM OLD.current_role_code OR NEW.status IS DISTINCT FROM OLD.status THEN
    
    -- Rejection / Clarification transitions are allowed to deviate from sequential steps
    IF NEW.status = 'REJECTED' OR NEW.status = 'CLARIFY-OPL' THEN
      RETURN NEW;
    END IF;

    -- For normal progression, verify the next step target
    SELECT * INTO v_next_step FROM public.get_next_active_workflow_step(OLD.request_type, OLD.team_id, OLD.created_by, OLD.current_step_order);
    
    IF v_next_step.is_approved THEN
      -- Terminal approval transition
      IF NEW.status NOT LIKE '%-APPROVED' AND NEW.status NOT IN ('PAID', 'RECEIVED') THEN
        RAISE EXCEPTION 'Invalid final status for request completion';
      END IF;
      IF NEW.completed_at IS NULL THEN
        RAISE EXCEPTION 'completed_at must be set upon final approval';
      END IF;
    ELSE
      -- Step-by-step intermediate progression
      IF NEW.current_step_order IS DISTINCT FROM v_next_step.step_order OR
         NEW.current_role_code IS DISTINCT FROM v_next_step.role_code OR
         (NEW.status NOT LIKE '%-REVIEWED' AND NEW.status IS DISTINCT FROM 'SUBMITTED') THEN
        RAISE EXCEPTION 'Workflow step skip detected. Expected next step %, role %', v_next_step.step_order, v_next_step.role_code;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Bind Trigger to approval_requests
DROP TRIGGER IF EXISTS trg_enforce_approval_requests_integrity ON public.approval_requests;
CREATE TRIGGER trg_enforce_approval_requests_integrity
  BEFORE UPDATE ON public.approval_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_approval_requests_integrity();

-- 3. Create Trigger Function for budget_plans
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
  IF OLD.status IS NOT NULL AND OLD.status NOT IN ('DRAFT', 'REJECTED', 'CLARIFY-OPL') THEN
    IF OLD.categories IS DISTINCT FROM NEW.categories OR
       OLD.total_amount IS DISTINCT FROM NEW.total_amount OR
       OLD.currency IS DISTINCT FROM NEW.currency OR
       OLD.exchange_rate IS DISTINCT FROM NEW.exchange_rate OR
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

-- Bind Trigger to budget_plans
DROP TRIGGER IF EXISTS trg_enforce_budget_plans_integrity ON public.budget_plans;
CREATE TRIGGER trg_enforce_budget_plans_integrity
  BEFORE UPDATE ON public.budget_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_budget_plans_integrity();
