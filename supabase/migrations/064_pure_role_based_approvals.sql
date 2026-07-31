-- Migration 064: Pure Role-Based Approvals for FIN, FIP, and FIH
-- Removes implicit user.role mappings for FIN, FIP, and FIH, forcing them to use request_role_assignments.
-- Retains CAO, CEO, and SYS (admin) implicit mappings for backwards compatibility.

-- 1. Drop dependent policies on messages table
DROP POLICY IF EXISTS select_messages ON public.messages;
DROP POLICY IF EXISTS update_messages ON public.messages;

-- 2. Drop functions
DROP FUNCTION IF EXISTS public.user_has_approval_role(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.users_with_approval_role(text, uuid);

-- 3. Recreate user_has_approval_role
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

  -- System admin has all roles
  IF v_org_role = 'admin' THEN
    RETURN true;
  END IF;

  -- CAO remains implicit for now
  IF v_role = 'CAO' AND v_org_role IN ('caoh', 'admin') THEN
    RETURN true;
  END IF;

  -- CEO remains implicit
  IF v_role = 'CEO' AND v_org_role = 'ceo' THEN
    RETURN true;
  END IF;

  -- SYS role check
  IF v_role = 'SYS' AND v_org_role = 'admin' THEN
    RETURN true;
  END IF;

  -- Check team-level operational roles
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

  -- Look up explicit database assignments in request_role_assignments
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

GRANT EXECUTE ON FUNCTION public.user_has_approval_role(uuid, text, uuid) TO authenticated;

-- 4. Recreate users_with_approval_role
CREATE OR REPLACE FUNCTION public.users_with_approval_role(p_role_code text, p_team_id uuid DEFAULT NULL)
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
      (u.role = 'admin') -- admin has all roles
      OR (v_role = 'CEO' AND u.role = 'ceo')
      OR (v_role = 'CAO' AND u.role = 'caoh')

    UNION

    SELECT ut.user_id AS uid
    FROM public.user_teams ut
    WHERE p_team_id IS NOT NULL AND ut.team_id = p_team_id AND (
      (v_role = 'OPH' AND ut.access_level = 'oht')
      OR (v_role = 'OPL' AND ut.access_level = 'lead')
      OR (v_role = 'OPS' AND ut.access_level = 'member')
    )

    UNION

    SELECT rra.user_id AS uid
    FROM public.request_role_assignments rra
    WHERE upper(rra.role_code) = v_role
      AND rra.is_active = true
      AND (rra.team_id IS NULL OR rra.team_id = p_team_id)
  ) x;
END;
$$;

GRANT EXECUTE ON FUNCTION public.users_with_approval_role(text, uuid) TO authenticated;

-- 5. Recreate dependent RLS policies on messages
CREATE POLICY select_messages ON public.messages
  FOR SELECT TO authenticated
  USING (
    sender_id = auth.uid()
    OR (recipient_type = 'user' AND recipient_id = auth.uid()::text AND public.can_chat_with(sender_id, auth.uid()))
    OR (recipient_type = 'team' AND EXISTS (
      SELECT 1 FROM public.user_teams ut
      WHERE ut.team_id::text = messages.recipient_id AND ut.user_id = auth.uid()
    ))
    OR (recipient_type = 'group' AND public.is_group_member(messages.recipient_id::uuid, auth.uid()))
    OR (recipient_type = 'role' AND (
      EXISTS (
        SELECT 1 FROM public.request_role_assignments rra
        WHERE rra.role_code = messages.recipient_id AND rra.user_id = auth.uid() AND rra.is_active = true
      )
      OR EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('caoh', 'oh', 'admin') AND (
          (messages.recipient_id = 'CAO' AND u.role IN ('caoh', 'admin'))
          OR (messages.recipient_id = 'FIH' AND u.role IN ('oh', 'admin'))
        )
      )
    ))
    OR (metadata->>'link_type' = 'budget' AND EXISTS (
      SELECT 1 FROM public.approval_requests r
      WHERE r.id::text = messages.metadata->>'link_id'
      AND (
        messages.metadata->'visible_to' IS NULL
        OR messages.metadata->'visible_to' = '[]'::jsonb
        OR messages.metadata->'visible_to' ? 'ALL'
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(messages.metadata->'visible_to') AS role_code
          WHERE public.user_has_approval_role(auth.uid(), role_code, r.team_id)
        )
      )
    ))
  );

CREATE POLICY update_messages ON public.messages
  FOR UPDATE TO authenticated
  USING (
    sender_id = auth.uid()
    OR (recipient_type = 'user' AND recipient_id = auth.uid()::text AND public.can_chat_with(sender_id, auth.uid()))
    OR (recipient_type = 'team' AND EXISTS (
      SELECT 1 FROM public.user_teams ut
      WHERE ut.team_id::text = messages.recipient_id AND ut.user_id = auth.uid()
    ))
    OR (recipient_type = 'group' AND public.is_group_member(messages.recipient_id::uuid, auth.uid()))
    OR (recipient_type = 'role' AND (
      EXISTS (
        SELECT 1 FROM public.request_role_assignments rra
        WHERE rra.role_code = messages.recipient_id AND rra.user_id = auth.uid() AND rra.is_active = true
      )
      OR EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('caoh', 'oh', 'admin') AND (
          (messages.recipient_id = 'CAO' AND u.role IN ('caoh', 'admin'))
          OR (messages.recipient_id = 'FIH' AND u.role IN ('oh', 'admin'))
        )
      )
    ))
    OR (metadata->>'link_type' = 'budget' AND EXISTS (
      SELECT 1 FROM public.approval_requests r
      WHERE r.id::text = messages.metadata->>'link_id'
      AND (
        messages.metadata->'visible_to' IS NULL
        OR messages.metadata->'visible_to' = '[]'::jsonb
        OR messages.metadata->'visible_to' ? 'ALL'
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(messages.metadata->'visible_to') AS role_code
          WHERE public.user_has_approval_role(auth.uid(), role_code, r.team_id)
        )
      )
    ))
  )
  WITH CHECK (true);
