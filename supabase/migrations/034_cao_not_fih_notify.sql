-- CAO (org role caoh) must NOT receive FIH notifications or act as FIH.
-- Keep DEFAULT NULL on p_team_id so CREATE OR REPLACE works without DROP
-- (policies depend on this function).

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

  -- FIH = OH only (not CAOH)
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

REVOKE ALL ON FUNCTION public.users_with_approval_role(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.users_with_approval_role(text, uuid) TO authenticated;
