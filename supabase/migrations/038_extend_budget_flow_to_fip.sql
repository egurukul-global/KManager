-- Extend budget approval flow: OPH (1) -> FIN (2) -> FIH (3) -> CAO (4) -> FIH (5) -> FIP (6)

-- 1. Recreate the budget approval flow steps cleanly
DELETE FROM public.approval_flow_steps
WHERE flow_id IN (SELECT id FROM public.approval_flow_definitions WHERE request_type = 'budget')
  AND step_order >= 5;

UPDATE public.approval_flow_steps
SET is_final = false
WHERE flow_id IN (SELECT id FROM public.approval_flow_definitions WHERE request_type = 'budget')
  AND role_code = 'CAO';

-- Insert step 5: FIH
INSERT INTO public.approval_flow_steps (flow_id, step_order, role_code, is_final)
SELECT f.id, 5, 'FIH', false
FROM public.approval_flow_definitions f
WHERE f.request_type = 'budget'
  AND NOT EXISTS (
    SELECT 1 FROM public.approval_flow_steps 
    WHERE flow_id = f.id AND step_order = 5
  );

-- Insert step 6: FIP
INSERT INTO public.approval_flow_steps (flow_id, step_order, role_code, is_final)
SELECT f.id, 6, 'FIP', true
FROM public.approval_flow_definitions f
WHERE f.request_type = 'budget'
  AND NOT EXISTS (
    SELECT 1 FROM public.approval_flow_steps 
    WHERE flow_id = f.id AND step_order = 6
  );

-- 2. Drop and recreate user_has_approval_role to avoid parameter default discrepancies
DROP FUNCTION IF EXISTS public.user_has_approval_role(uuid, text, uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.user_has_approval_role(
  p_user_id uuid,
  p_role_code text,
  p_team_id uuid DEFAULT NULL
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

  -- FIH/CAO can perform FIP payments directly
  IF v_role = 'FIP' AND (v_org_role IN ('caoh', 'oh', 'admin') OR EXISTS (
    SELECT 1 FROM request_role_assignments rra
    WHERE rra.user_id = p_user_id
      AND upper(rra.role_code) IN ('FIH', 'CAO')
      AND rra.is_active = true
      AND (rra.team_id IS NULL OR rra.team_id = p_team_id)
  )) THEN
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

-- 3. Grant global roles (FIN, FIP, FIH, CAO) read access to all approval requests at all times
DROP POLICY IF EXISTS approval_requests_select_global_roles ON public.approval_requests;

CREATE POLICY approval_requests_select_global_roles ON public.approval_requests
  FOR SELECT TO authenticated
  USING (
    is_deleted = false
    AND (
      EXISTS (
        SELECT 1 FROM public.request_role_assignments rra
        WHERE rra.user_id = auth.uid()
          AND rra.is_active = true
          AND (rra.team_id IS NULL OR rra.team_id = approval_requests.team_id)
      )
      OR EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid()
          AND u.role IN ('caoh', 'oh', 'admin')
      )
    )
  );
