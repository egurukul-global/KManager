-- Migration 061: Extend chat_permissions table and can_chat_with function
ALTER TABLE public.chat_permissions ADD COLUMN IF NOT EXISTS allowed_roles TEXT[] DEFAULT '{}';
ALTER TABLE public.chat_permissions ADD COLUMN IF NOT EXISTS allowed_teams UUID[] DEFAULT '{}';

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
  role_b text;
  is_admin_a boolean;
  allowed_users_a uuid[];
  allowed_roles_a text[];
  allowed_teams_a uuid[];
BEGIN
  -- Always allow self chat
  IF user_a = user_b THEN
    RETURN true;
  END IF;

  -- Check admin bypass
  SELECT (role = 'admin'), role INTO is_admin_a, role_a FROM public.users WHERE id = user_a;
  IF is_admin_a THEN
    RETURN true;
  END IF;

  -- Check explicit whitelist override (allowed_users, allowed_roles, allowed_teams)
  SELECT allow_opposite_gender, cross_team_access, allowed_users, allowed_roles, allowed_teams
    INTO allow_opposite_a, access_a, allowed_users_a, allowed_roles_a, allowed_teams_a
    FROM public.chat_permissions WHERE user_id = user_a;

  SELECT role, gender INTO role_b, gender_b FROM public.users WHERE id = user_b;

  -- Check allowed_users
  IF user_b = ANY(COALESCE(allowed_users_a, '{}')) THEN
    RETURN true;
  END IF;

  -- Check allowed_roles
  IF role_b = ANY(COALESCE(allowed_roles_a, '{}')) THEN
    RETURN true;
  END IF;

  -- Check allowed_teams
  IF EXISTS (
    SELECT 1 FROM public.user_teams WHERE user_id = user_b AND team_id = ANY(COALESCE(allowed_teams_a, '{}'))
  ) THEN
    RETURN true;
  END IF;

  -- Get gender of A
  SELECT gender INTO gender_a FROM public.users WHERE id = user_a;

  -- Get opposing gender check for B
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
