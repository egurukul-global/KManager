-- Fix approval_messages → public.users relationship for PostgREST embeds
-- Add approval-step One Kailasa notifications (ok_messages)

-- 1) FK: author_id must reference public.users (not only auth.users) for users:author_id embeds
ALTER TABLE public.approval_messages
  DROP CONSTRAINT IF EXISTS approval_messages_author_id_fkey;

ALTER TABLE public.approval_messages
  ADD CONSTRAINT approval_messages_author_id_fkey
  FOREIGN KEY (author_id) REFERENCES public.users(id);

-- 2) Optional deeplink fields on home notifications
ALTER TABLE public.ok_messages
  ADD COLUMN IF NOT EXISTS action_page text,
  ADD COLUMN IF NOT EXISTS action_id text;

COMMENT ON COLUMN public.ok_messages.action_page IS 'Finance page id to open when tapped (e.g. approval-portal)';
COMMENT ON COLUMN public.ok_messages.action_id IS 'Optional entity id (e.g. approval request id)';

-- 3) Resolve user ids who hold an approval role for a team (mirrors user_has_approval_role)
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
    -- Org roles
    SELECT u.id AS uid
    FROM public.users u
    WHERE
      (v_role = 'SYS' AND lower(coalesce(u.role, '')) = 'admin')
      OR (v_role = 'CEO' AND lower(coalesce(u.role, '')) = 'ceo')
      OR (v_role = 'CAO' AND lower(coalesce(u.role, '')) = 'caoh')
      OR (v_role = 'FIH' AND lower(coalesce(u.role, '')) IN ('oh', 'caoh'))

    UNION

    -- Team access levels
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

    -- Explicit role assignments
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

-- 4) Insert ok_messages for actors (bypasses insert RLS via SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.notify_approval_actors(
  p_team_id uuid,
  p_role_code text,
  p_title text,
  p_body text,
  p_exclude_user_id uuid DEFAULT NULL,
  p_action_page text DEFAULT 'approval-portal',
  p_action_id text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF coalesce(trim(p_title), '') = '' THEN
    RETURN 0;
  END IF;

  INSERT INTO public.ok_messages (user_id, team_id, title, body, action_page, action_id)
  SELECT
    u.user_id,
    p_team_id,
    left(trim(p_title), 200),
    coalesce(p_body, ''),
    nullif(trim(p_action_page), ''),
    nullif(trim(p_action_id), '')
  FROM public.users_with_approval_role(p_role_code, p_team_id) u
  WHERE p_exclude_user_id IS NULL OR u.user_id <> p_exclude_user_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_approval_actors(uuid, text, text, text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_approval_actors(uuid, text, text, text, uuid, text, text) TO authenticated;

-- 5) Notify a single user (e.g. requester on final approve/reject)
CREATE OR REPLACE FUNCTION public.notify_ok_user(
  p_user_id uuid,
  p_title text,
  p_body text,
  p_team_id uuid DEFAULT NULL,
  p_action_page text DEFAULT 'approval-portal',
  p_action_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR coalesce(trim(p_title), '') = '' THEN
    RETURN;
  END IF;

  INSERT INTO public.ok_messages (user_id, team_id, title, body, action_page, action_id)
  VALUES (
    p_user_id,
    p_team_id,
    left(trim(p_title), 200),
    coalesce(p_body, ''),
    nullif(trim(p_action_page), ''),
    nullif(trim(p_action_id), '')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.notify_ok_user(uuid, text, text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_ok_user(uuid, text, text, uuid, text, text) TO authenticated;
