-- Migration 069: Fix Skip-Level Approvals in Requests Integrity Trigger
-- Updates both enforce_approval_requests_integrity and user_can_act_on_approval_request
-- to restrict skip-level permissions to steps before CAO for standard users.
-- This prevents post-CAO payment roles (like FIP/FIH at step 5/6) from skip-approving pre-CAO steps.

CREATE OR REPLACE FUNCTION public.user_can_act_on_approval_request(p_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req approval_requests%ROWTYPE;
  v_clarify_role text;
  v_org_role text;
BEGIN
  SELECT * INTO v_req FROM approval_requests
  WHERE id = p_request_id AND is_deleted = false;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT role INTO v_org_role FROM users WHERE id = auth.uid();

  -- System admin only may act on any open step
  IF lower(coalesce(v_org_role, '')) = 'admin' THEN
    IF v_req.status = 'REJECTED' OR v_req.status LIKE '%-APPROVED' THEN
      RETURN false;
    END IF;
    IF v_req.created_by = auth.uid() AND v_req.current_role_code IS NOT NULL THEN
      RETURN false;
    END IF;
    RETURN v_req.current_role_code IS NOT NULL OR v_req.status LIKE 'CLARIFY-%';
  END IF;

  IF v_req.status = 'REJECTED' OR v_req.status LIKE '%-APPROVED' THEN
    RETURN false;
  END IF;

  IF v_req.status LIKE 'CLARIFY-%' THEN
    v_clarify_role := substring(v_req.status from 9);
    RETURN public.user_has_approval_role(auth.uid(), v_clarify_role, v_req.team_id)
      OR v_req.created_by = auth.uid();
  END IF;

  IF v_req.current_role_code IS NOT NULL THEN
    -- Submitter cannot approve their own request at any step
    IF v_req.created_by = auth.uid() THEN
      RETURN false;
    END IF;

    -- 1. User has the current role code
    IF public.user_has_approval_role(auth.uid(), v_req.current_role_code, v_req.team_id) THEN
      RETURN true;
    END IF;

    -- 2. Skip-level / emergency approval: User has a role code defined at a HIGHER step in this request's flow
    RETURN EXISTS (
      WITH active_flow AS (
        SELECT id FROM public.approval_flow_definitions
        WHERE request_type = v_req.request_type
          AND is_active = true
          AND (
            (team_id = v_req.team_id AND user_id = v_req.created_by)
            OR (team_id = v_req.team_id AND user_id IS NULL)
            OR (team_id IS NULL AND user_id = v_req.created_by)
            OR (team_id IS NULL AND user_id IS NULL)
          )
        ORDER BY
          (CASE WHEN team_id = v_req.team_id AND user_id = v_req.created_by THEN 4
                WHEN team_id = v_req.team_id AND user_id IS NULL THEN 3
                WHEN team_id IS NULL AND user_id = v_req.created_by THEN 2
                ELSE 1 END) DESC,
          priority DESC
        LIMIT 1
      ),
      cao_step AS (
        SELECT step_order FROM public.approval_flow_steps
        WHERE flow_id = (SELECT id FROM active_flow) AND upper(role_code) = 'CAO'
        LIMIT 1
      )
      SELECT 1 FROM public.approval_flow_steps afs
      WHERE afs.flow_id = (SELECT id FROM active_flow)
        AND afs.step_order > v_req.current_step_order
        AND public.user_has_approval_role(auth.uid(), afs.role_code, v_req.team_id)
        AND (
          lower(coalesce(v_org_role, '')) IN ('cao', 'ceo')
          OR public.user_has_approval_role(auth.uid(), 'CAO', v_req.team_id)
          OR public.user_has_approval_role(auth.uid(), 'CEO', v_req.team_id)
          -- Standard users can only skip to a step before CAO
          OR afs.step_order < (SELECT step_order FROM cao_step)
          OR (SELECT step_order FROM cao_step) IS NULL
        )
    );
  END IF;

  RETURN v_req.created_by = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.user_can_act_on_approval_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_act_on_approval_request(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.enforce_approval_requests_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_role text;
  v_is_admin boolean := false;
  v_flow_id uuid;
  v_cao_step_order integer;
  v_user_highest_step_order integer;
  v_expected_next_step_order integer;
  v_expected_next_role_code text;
  v_expected_next_is_approved boolean;
  v_step record;
  v_is_already_approved boolean;
BEGIN
  -- Resolve authenticated user's role
  SELECT role INTO v_user_role FROM public.users WHERE id = auth.uid();
  v_is_admin := (v_user_role = 'admin');

  -- Resolve active flow ID
  SELECT f.id INTO v_flow_id
  FROM public.approval_flow_definitions f
  WHERE f.request_type = OLD.request_type
    AND (f.team_id IS NULL OR f.team_id = OLD.team_id)
    AND f.is_active = true
  ORDER BY (f.team_id IS NOT NULL) DESC, f.priority DESC
  LIMIT 1;

  -- Find the step order of the CAO step
  SELECT step_order INTO v_cao_step_order
  FROM public.approval_flow_steps
  WHERE flow_id = v_flow_id AND upper(role_code) = 'CAO'
  LIMIT 1;

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
    -- Find active flow definition
    SELECT f.id INTO v_flow_id
    FROM public.approval_flow_definitions f
    WHERE f.request_type = OLD.request_type
      AND (f.team_id IS NULL OR f.team_id = OLD.team_id)
      AND f.is_active = true
    ORDER BY (f.team_id IS NOT NULL) DESC, f.priority DESC
    LIMIT 1;

    -- Submission transition: DRAFT -> SUBMITTED (or auto-approved state)
    IF OLD.status = 'DRAFT' AND NEW.status IS DISTINCT FROM 'DRAFT' THEN
      -- Standard next unsatisfied step lookup
      v_expected_next_is_approved := true;
      FOR v_step IN 
        SELECT s.step_order, s.role_code
        FROM public.approval_flow_steps s
        WHERE s.flow_id = v_flow_id
        ORDER BY s.step_order ASC
      LOOP
        IF NOT public.user_has_approval_role(OLD.created_by, v_step.role_code, OLD.team_id) THEN
          v_expected_next_step_order := v_step.step_order;
          v_expected_next_role_code := v_step.role_code;
          v_expected_next_is_approved := false;
          EXIT;
        END IF;
      END LOOP;
      
      IF v_expected_next_is_approved THEN
        -- Auto-approved scenario
        IF NEW.status NOT LIKE '%-APPROVED' OR NEW.completed_at IS NULL THEN
          RAISE EXCEPTION 'Auto-approved transition requires status to be approved and completed_at to be populated';
        END IF;
      ELSE
        -- Standard submission
        IF NEW.status IS DISTINCT FROM 'SUBMITTED' OR
           NEW.current_step_order IS DISTINCT FROM v_expected_next_step_order OR
           NEW.current_role_code IS DISTINCT FROM v_expected_next_role_code OR
           NEW.completed_at IS NOT NULL OR
           NEW.step_approved = true THEN
          RAISE EXCEPTION 'Invalid initial workflow step. Expected step %, role %', v_expected_next_step_order, v_expected_next_role_code;
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

  -- Ensure the approver has not already approved this request at a previous step (only for pre-CAO and CAO steps)
  IF OLD.current_step_order <= coalesce(v_cao_step_order, 99) THEN
    IF EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.metadata->>'link_id' = OLD.id::text
        AND m.sender_id = auth.uid()
        AND (m.body LIKE '%[Approval System] Approved%' OR m.body LIKE '%Approved and sent forward%')
    ) THEN
      RAISE EXCEPTION 'You have already approved this request and cannot approve it again';
    END IF;
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



    -- If user has the current step's role code, they are approving normally (no skip-level)
    IF public.user_has_approval_role(auth.uid(), OLD.current_role_code, OLD.team_id) THEN
      v_user_highest_step_order := OLD.current_step_order;
    ELSE
      -- Find the highest step order in this flow that the user has approval role for (skip-level/emergency)
      SELECT max(s.step_order) INTO v_user_highest_step_order
      FROM public.approval_flow_steps s
      WHERE s.flow_id = v_flow_id
        AND public.user_has_approval_role(auth.uid(), s.role_code, OLD.team_id)
        AND (
          v_is_admin 
          OR public.user_has_approval_role(auth.uid(), 'CAO', OLD.team_id)
          OR public.user_has_approval_role(auth.uid(), 'CEO', OLD.team_id)
          OR s.step_order < v_cao_step_order
        );

      -- If no higher step matches, fallback to the request's current step order
      IF v_user_highest_step_order IS NULL THEN
        v_user_highest_step_order := OLD.current_step_order;
      END IF;
    END IF;

    -- Resolve the next unsatisfied step order (skipping steps that have already been approved by a user with that role)
    v_expected_next_is_approved := true;
    FOR v_step IN
      SELECT s.step_order, s.role_code
      FROM public.approval_flow_steps s
      WHERE s.flow_id = v_flow_id
        AND s.step_order > v_user_highest_step_order
      ORDER BY s.step_order ASC
    LOOP
      v_is_already_approved := false;
      
      -- Auto-satisfy only approval steps (<= CAO)
      IF v_cao_step_order IS NULL OR v_step.step_order <= v_cao_step_order THEN
        IF public.user_has_approval_role(auth.uid(), v_step.role_code, OLD.team_id) OR EXISTS (
          SELECT 1 FROM public.messages m
          WHERE m.metadata->>'link_id' = OLD.id::text
            AND (m.body LIKE '%[Approval System] Approved%' OR m.body LIKE '%Approved and sent forward%')
            AND public.user_has_approval_role(m.sender_id, v_step.role_code, OLD.team_id)
        ) THEN
          v_is_already_approved := true;
        END IF;
      END IF;

      IF NOT v_is_already_approved THEN
        v_expected_next_step_order := v_step.step_order;
        v_expected_next_role_code := v_step.role_code;
        v_expected_next_is_approved := false;
        EXIT;
      END IF;
    END LOOP;
    
    IF v_expected_next_is_approved THEN
      -- Terminal approval transition
      IF NEW.status NOT LIKE '%-APPROVED' AND NEW.status NOT IN ('PAID', 'RECEIVED') THEN
        RAISE EXCEPTION 'Invalid final status for request completion';
      END IF;
      IF NEW.completed_at IS NULL THEN
        RAISE EXCEPTION 'completed_at must be set upon final approval';
      END IF;
    ELSE
      -- Progression validation: both target order and role code must match the first unsatisfied step
      IF NEW.current_step_order IS DISTINCT FROM v_expected_next_step_order OR
         NEW.current_role_code IS DISTINCT FROM v_expected_next_role_code OR
         (NEW.status NOT LIKE '%-REVIEWED' AND NEW.status IS DISTINCT FROM 'SUBMITTED') THEN
        RAISE EXCEPTION 'Workflow step skip detected. Expected next step %, role % (Actual step %, role %, status %)', 
          v_expected_next_step_order, v_expected_next_role_code,
          NEW.current_step_order, NEW.current_role_code, NEW.status;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
