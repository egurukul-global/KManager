-- Migration 051: Add allowed_users column to chat_permissions and update can_chat_with
ALTER TABLE public.chat_permissions ADD COLUMN IF NOT EXISTS allowed_users UUID[] DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.can_chat_with(user_a uuid, user_b uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gender_a text;
  gender_b text;
  allow_opposite_a boolean;
  allow_opposite_b boolean;
  access_a text;
  role_a text;
  is_admin_a boolean;
BEGIN
  -- Always allow self chat
  IF user_a = user_b THEN
    RETURN true;
  END IF;

  -- Check admin bypass
  SELECT (role = 'admin') INTO is_admin_a FROM public.users WHERE id = user_a;
  IF is_admin_a THEN
    RETURN true;
  END IF;

  -- Check explicit whitelist override
  IF EXISTS (
    SELECT 1 FROM public.chat_permissions
    WHERE user_id = user_a AND user_b = ANY(allowed_users)
  ) THEN
    RETURN true;
  END IF;

  -- Get genders
  SELECT gender INTO gender_a FROM public.users WHERE id = user_a;
  SELECT gender INTO gender_b FROM public.users WHERE id = user_b;

  -- Get permissions and role
  SELECT role INTO role_a FROM public.users WHERE id = user_a;
  SELECT allow_opposite_gender, cross_team_access INTO allow_opposite_a, access_a 
    FROM public.chat_permissions WHERE user_id = user_a;
  SELECT allow_opposite_gender INTO allow_opposite_b 
    FROM public.chat_permissions WHERE user_id = user_b;

  -- Opposing gender checks
  IF gender_a IS NOT NULL AND gender_b IS NOT NULL AND gender_a <> gender_b THEN
    IF COALESCE(allow_opposite_a, false) = false OR COALESCE(allow_opposite_b, false) = false THEN
      RETURN false;
    END IF;
  END IF;

  -- Treat global roles (caoh, oh, fin, admin) as having global cross-team access
  IF role_a IN ('caoh', 'oh', 'fin', 'admin') THEN
    access_a := 'global';
  END IF;

  -- Cross-team rules
  IF COALESCE(access_a, 'none') = 'global' THEN
    RETURN true;
  END IF;

  -- Default 'none' / 'team': Must share a team
  RETURN EXISTS (
    SELECT 1 FROM public.user_teams ut1
    JOIN public.user_teams ut2 ON ut1.team_id = ut2.team_id
    WHERE ut1.user_id = user_a AND ut2.user_id = user_b
  );
END;
$$;
