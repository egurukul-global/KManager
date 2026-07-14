-- Notification UX: preference, category, clear on resolve, prune stale

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS notification_mode text;

UPDATE public.users
SET notification_mode = 'summary'
WHERE notification_mode IS NULL OR notification_mode NOT IN ('summary', 'detail');

ALTER TABLE public.users
  ALTER COLUMN notification_mode SET DEFAULT 'summary';

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_notification_mode_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_notification_mode_check
  CHECK (notification_mode IN ('summary', 'detail'));

ALTER TABLE public.ok_messages
  ADD COLUMN IF NOT EXISTS category text;

COMMENT ON COLUMN public.users.notification_mode IS 'summary = counts only; detail = one line per request';
COMMENT ON COLUMN public.ok_messages.category IS 'Grouping key: budget, money_transfer, reconciliation_adjustment, other';

-- Users may delete their own notifications
DROP POLICY IF EXISTS ok_messages_delete_own ON public.ok_messages;
CREATE POLICY ok_messages_delete_own ON public.ok_messages
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_ok_admin());

-- Clear all home notifications for a request (when approved / sent / rejected / cancelled)
CREATE OR REPLACE FUNCTION public.clear_ok_messages_for_action(p_action_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF coalesce(trim(p_action_id), '') = '' THEN
    RETURN 0;
  END IF;

  DELETE FROM public.ok_messages
  WHERE action_id = trim(p_action_id);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_ok_messages_for_action(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_ok_messages_for_action(text) TO authenticated;

-- Drop stale approval notifies the user can no longer act on (e.g. CAO still seeing FIH alerts)
CREATE OR REPLACE FUNCTION public.prune_stale_ok_approval_messages(p_user_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := coalesce(p_user_id, auth.uid());
  v_count integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 0;
  END IF;

  DELETE FROM public.ok_messages m
  WHERE m.user_id = v_uid
    AND m.action_id IS NOT NULL
    AND coalesce(m.action_page, '') IN ('approval-portal', '')
    AND (
      -- Request gone / deleted
      NOT EXISTS (
        SELECT 1 FROM public.approval_requests ar
        WHERE ar.id::text = m.action_id
          AND ar.is_deleted = false
      )
      OR EXISTS (
        SELECT 1 FROM public.approval_requests ar
        WHERE ar.id::text = m.action_id
          AND ar.is_deleted = false
          AND ar.current_role_code IS NOT NULL
          AND ar.status <> 'REJECTED'
          AND ar.status NOT LIKE '%-APPROVED'
          -- Still open but waiting on someone else (not this user)
          AND NOT public.user_has_approval_role(v_uid, ar.current_role_code, ar.team_id)
          AND ar.created_by <> v_uid
      )
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_stale_ok_approval_messages(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_stale_ok_approval_messages(uuid) TO authenticated;

-- Recreate notify helpers with category (same arg count + new optional last param requires drop)
DROP FUNCTION IF EXISTS public.notify_approval_actors(uuid, text, text, text, uuid, text, text);

CREATE FUNCTION public.notify_approval_actors(
  p_team_id uuid,
  p_role_code text,
  p_title text,
  p_body text,
  p_exclude_user_id uuid DEFAULT NULL,
  p_action_page text DEFAULT 'approval-portal',
  p_action_id text DEFAULT NULL,
  p_category text DEFAULT 'other'
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

  INSERT INTO public.ok_messages (user_id, team_id, title, body, action_page, action_id, category)
  SELECT
    u.user_id,
    p_team_id,
    left(trim(p_title), 200),
    coalesce(p_body, ''),
    nullif(trim(p_action_page), ''),
    nullif(trim(p_action_id), ''),
    nullif(trim(coalesce(p_category, 'other')), '')
  FROM public.users_with_approval_role(p_role_code, p_team_id) u
  WHERE p_exclude_user_id IS NULL OR u.user_id <> p_exclude_user_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_approval_actors(uuid, text, text, text, uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_approval_actors(uuid, text, text, text, uuid, text, text, text) TO authenticated;

DROP FUNCTION IF EXISTS public.notify_ok_user(uuid, text, text, uuid, text, text);

CREATE FUNCTION public.notify_ok_user(
  p_user_id uuid,
  p_title text,
  p_body text,
  p_team_id uuid DEFAULT NULL,
  p_action_page text DEFAULT 'approval-portal',
  p_action_id text DEFAULT NULL,
  p_category text DEFAULT 'other'
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

  INSERT INTO public.ok_messages (user_id, team_id, title, body, action_page, action_id, category)
  VALUES (
    p_user_id,
    p_team_id,
    left(trim(p_title), 200),
    coalesce(p_body, ''),
    nullif(trim(p_action_page), ''),
    nullif(trim(p_action_id), ''),
    nullif(trim(coalesce(p_category, 'other')), '')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.notify_ok_user(uuid, text, text, uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_ok_user(uuid, text, text, uuid, text, text, text) TO authenticated;

-- One-time: remove FIH waiting messages incorrectly left for CAO (caoh) users
DELETE FROM public.ok_messages m
USING public.users u
WHERE m.user_id = u.id
  AND lower(coalesce(u.role, '')) = 'caoh'
  AND (
    m.body ILIKE '%waiting for FIH%'
    OR m.body ILIKE '%FIH review%'
    OR m.title ILIKE '%FIH%'
  );
