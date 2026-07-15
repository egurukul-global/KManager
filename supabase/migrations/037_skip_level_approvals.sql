-- Support skip-level / emergency approvals by allowing users with roles defined at a higher step in the request's flow to act on the request.

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
      )
      SELECT 1 FROM public.approval_flow_steps afs
      WHERE afs.flow_id = (SELECT id FROM active_flow)
        AND afs.step_order > v_req.current_step_order
        AND public.user_has_approval_role(auth.uid(), afs.role_code, v_req.team_id)
    );
  END IF;

  RETURN v_req.created_by = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.user_can_act_on_approval_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_act_on_approval_request(uuid) TO authenticated;
