-- Extend budget approval flow to FIP (Finance Payments) and support FIP checks for FIH/CAO.

-- 1. Update budget approval flow steps
UPDATE public.approval_flow_steps
SET is_final = false
WHERE flow_id IN (SELECT id FROM public.approval_flow_definitions WHERE request_type = 'budget')
  AND role_code = 'CAO';

INSERT INTO public.approval_flow_steps (flow_id, step_order, role_code, is_final)
SELECT f.id, 5, 'FIP', true
FROM public.approval_flow_definitions f
WHERE f.request_type = 'budget'
  AND NOT EXISTS (
    SELECT 1 FROM public.approval_flow_steps 
    WHERE flow_id = f.id AND role_code = 'FIP'
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
