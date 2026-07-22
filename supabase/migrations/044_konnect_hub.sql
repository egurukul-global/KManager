-- Migration 044: Create Konnect Chat tables and Security Rules

-- 1. Create chat_groups table
CREATE TABLE IF NOT EXISTS public.chat_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create chat_group_members table
CREATE TABLE IF NOT EXISTS public.chat_group_members (
  group_id UUID REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  PRIMARY KEY (group_id, user_id)
);

-- Enable RLS for chat_groups and chat_group_members
ALTER TABLE public.chat_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_group_members ENABLE ROW LEVEL SECURITY;

-- 3. Create helper function to bypass RLS recursion on membership checks
CREATE OR REPLACE FUNCTION public.is_group_member(p_group_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_group_members
    WHERE group_id = p_group_id AND user_id = p_user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_group_member(uuid, uuid) TO authenticated;

-- 4. Define policies for chat_groups using the helper
DROP POLICY IF EXISTS select_chat_groups ON public.chat_groups;
CREATE POLICY select_chat_groups ON public.chat_groups
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR public.is_group_member(id, auth.uid())
  );

DROP POLICY IF EXISTS manage_chat_groups ON public.chat_groups;
CREATE POLICY manage_chat_groups ON public.chat_groups
  FOR ALL TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- 5. Define policies for chat_group_members
DROP POLICY IF EXISTS select_group_members ON public.chat_group_members;
CREATE POLICY select_group_members ON public.chat_group_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_group_member(group_id, auth.uid())
  );

DROP POLICY IF EXISTS manage_group_members ON public.chat_group_members;
CREATE POLICY manage_group_members ON public.chat_group_members
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_groups cg
      WHERE cg.id = chat_group_members.group_id AND cg.created_by = auth.uid()
    )
  );


-- 6. Create chat_preferences table
CREATE TABLE IF NOT EXISTS public.chat_preferences (
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  chat_target_type TEXT NOT NULL CHECK (chat_target_type IN ('user', 'team', 'group')),
  chat_target_id TEXT NOT NULL,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  PRIMARY KEY (user_id, chat_target_type, chat_target_id)
);

-- Enable RLS for chat_preferences
ALTER TABLE public.chat_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS manage_chat_preferences ON public.chat_preferences;
CREATE POLICY manage_chat_preferences ON public.chat_preferences
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- 7. Create chat_permissions table
CREATE TABLE IF NOT EXISTS public.chat_permissions (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  allow_opposite_gender BOOLEAN NOT NULL DEFAULT false,
  cross_team_access TEXT NOT NULL DEFAULT 'none' CHECK (cross_team_access IN ('none', 'team', 'global')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for chat_permissions
ALTER TABLE public.chat_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_chat_permissions ON public.chat_permissions;
CREATE POLICY select_chat_permissions ON public.chat_permissions
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS manage_chat_permissions ON public.chat_permissions;
CREATE POLICY manage_chat_permissions ON public.chat_permissions
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );


-- 8. Create public.can_chat_with validation function
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

  -- Get genders
  SELECT gender INTO gender_a FROM public.users WHERE id = user_a;
  SELECT gender INTO gender_b FROM public.users WHERE id = user_b;

  -- Get permissions
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

GRANT EXECUTE ON FUNCTION public.can_chat_with(uuid, uuid) TO authenticated;


-- 9. Recreate public.messages RLS policies to check direct/group/team limits
DROP POLICY IF EXISTS select_messages ON public.messages;
DROP POLICY IF EXISTS insert_messages ON public.messages;
DROP POLICY IF EXISTS update_messages ON public.messages;

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
    ))
  );

CREATE POLICY insert_messages ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      recipient_type = 'team'
      OR recipient_type = 'role'
      OR (recipient_type = 'user' AND public.can_chat_with(auth.uid(), recipient_id::uuid))
      OR (recipient_type = 'group' AND public.is_group_member(messages.recipient_id::uuid, auth.uid()))
    )
  );

CREATE POLICY update_messages ON public.messages
  FOR UPDATE TO authenticated
  USING (
    sender_id = auth.uid()
    OR (recipient_type = 'user' AND recipient_id = auth.uid()::text)
    OR (recipient_type = 'team' AND EXISTS (
      SELECT 1 FROM public.user_teams ut
      WHERE ut.team_id::text = messages.recipient_id AND ut.user_id = auth.uid()
    ))
    OR (recipient_type = 'group' AND public.is_group_member(messages.recipient_id::uuid, auth.uid()))
  )
  WITH CHECK (true);
