-- Approvers act only at their step; org admins no longer bypass the queue.
-- Also ensure role-assignment teams are readable for inbox filtering.

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
    RETURN public.user_has_approval_role(auth.uid(), v_req.current_role_code, v_req.team_id);
  END IF;

  RETURN v_req.created_by = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.user_can_act_on_approval_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_act_on_approval_request(uuid) TO authenticated;

-- Teams visible to users who hold an approval assignment for that team (or global)
DROP POLICY IF EXISTS teams_select_role_assignment ON public.teams;
CREATE POLICY teams_select_role_assignment ON public.teams
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.request_role_assignments rra
      WHERE rra.user_id = auth.uid()
        AND rra.is_active = true
        AND (rra.team_id IS NULL OR rra.team_id = teams.id)
    )
  );

-- Approval requests: allow select when awaiting the user's role (even without team membership)
DROP POLICY IF EXISTS approval_requests_select_assignee ON public.approval_requests;
CREATE POLICY approval_requests_select_assignee ON public.approval_requests
  FOR SELECT TO authenticated
  USING (
    is_deleted = false
    AND current_role_code IS NOT NULL
    AND public.user_has_approval_role(auth.uid(), current_role_code, team_id)
  );

-- Messages readable when the request is awaiting your role
DROP POLICY IF EXISTS approval_messages_select_assignee ON public.approval_messages;
CREATE POLICY approval_messages_select_assignee ON public.approval_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.approval_requests ar
      WHERE ar.id = approval_messages.request_id
        AND ar.is_deleted = false
        AND ar.current_role_code IS NOT NULL
        AND public.user_has_approval_role(auth.uid(), ar.current_role_code, ar.team_id)
    )
  );

-- Org role maps 1:1 to its step (CAO ≠ FIH). FIN comes from request_role_assignments.
CREATE OR REPLACE FUNCTION public.user_has_approval_role(
  p_user_id uuid,
  p_role_code text,
  p_team_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := upper(trim(COALESCE(p_role_code, '')));
  v_org_role text;
BEGIN
  IF v_role = '' OR p_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT role INTO v_org_role FROM users WHERE id = p_user_id;

  IF v_role = 'CAO' AND v_org_role IN ('caoh', 'admin') THEN
    RETURN true;
  END IF;

  IF v_role = 'FIH' AND v_org_role IN ('oh', 'admin') THEN
    RETURN true;
  END IF;

  IF v_role = 'CEO' AND v_org_role = 'ceo' THEN
    RETURN true;
  END IF;

  IF v_role = 'SYS' AND v_org_role = 'admin' THEN
    RETURN true;
  END IF;

  IF p_team_id IS NOT NULL THEN
    IF v_role = 'OPH' AND EXISTS (
      SELECT 1 FROM user_teams ut
      WHERE ut.user_id = p_user_id AND ut.team_id = p_team_id AND ut.access_level = 'oht'
    ) THEN
      RETURN true;
    END IF;

    IF v_role = 'OPL' AND EXISTS (
      SELECT 1 FROM user_teams ut
      WHERE ut.user_id = p_user_id AND ut.team_id = p_team_id AND ut.access_level = 'lead'
    ) THEN
      RETURN true;
    END IF;

    IF v_role = 'OPS' AND EXISTS (
      SELECT 1 FROM user_teams ut
      WHERE ut.user_id = p_user_id AND ut.team_id = p_team_id AND ut.access_level = 'member'
    ) THEN
      RETURN true;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM request_role_assignments rra
    WHERE rra.user_id = p_user_id
      AND upper(rra.role_code) = v_role
      AND rra.is_active = true
      AND (rra.team_id IS NULL OR rra.team_id = p_team_id)
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.user_has_approval_role(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_has_approval_role(uuid, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.users_with_approval_role(p_role_code text, p_team_id uuid)
RETURNS TABLE (user_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := upper(trim(coalesce(p_role_code, '')));
BEGIN
  IF v_role = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT x.uid
  FROM (
    SELECT u.id AS uid
    FROM public.users u
    WHERE
      (v_role = 'SYS' AND lower(coalesce(u.role, '')) = 'admin')
      OR (v_role = 'CEO' AND lower(coalesce(u.role, '')) = 'ceo')
      OR (v_role = 'CAO' AND lower(coalesce(u.role, '')) = 'caoh')
      OR (v_role = 'FIH' AND lower(coalesce(u.role, '')) = 'oh')

    UNION

    SELECT ut.user_id AS uid
    FROM public.user_teams ut
    WHERE p_team_id IS NOT NULL
      AND ut.team_id = p_team_id
      AND (
        (v_role = 'OPH' AND ut.access_level = 'oht')
        OR (v_role = 'OPL' AND ut.access_level = 'lead')
        OR (v_role = 'OPS' AND ut.access_level = 'member')
      )

    UNION

    SELECT rra.user_id AS uid
    FROM public.request_role_assignments rra
    WHERE rra.is_active = true
      AND upper(rra.role_code) = v_role
      AND (rra.team_id IS NULL OR rra.team_id = p_team_id)
  ) x
  WHERE x.uid IS NOT NULL;
END;
$$;
