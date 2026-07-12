-- Segregation of duties: requester cannot approve their own in-flight request.
-- Org/system admins may still act on others' requests (break-glass).

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
BEGIN
  SELECT * INTO v_req FROM approval_requests
  WHERE id = p_request_id AND is_deleted = false;

  IF NOT FOUND THEN
    RETURN false;
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
    -- Cannot approve/send your own request through the workflow.
    IF v_req.created_by = auth.uid() THEN
      RETURN false;
    END IF;

    IF public.user_has_approval_role(auth.uid(), v_req.current_role_code, v_req.team_id) THEN
      RETURN true;
    END IF;

    -- Break-glass for org/system admins on someone else's request only.
    IF public.is_org_admin() THEN
      RETURN true;
    END IF;

    RETURN false;
  END IF;

  RETURN v_req.created_by = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.user_can_act_on_approval_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_act_on_approval_request(uuid) TO authenticated;
