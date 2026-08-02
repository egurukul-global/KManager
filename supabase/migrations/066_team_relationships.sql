-- Migration 066: Team Relationships, Hierarchy, and Recursive RLS for Messages and Tasks

-- 1. Create team_relationships table
CREATE TABLE IF NOT EXISTS public.team_relationships (
  parent_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (parent_id, child_id),
  CONSTRAINT parent_id_neq_child_id CHECK (parent_id <> child_id)
);

-- Enable RLS for team_relationships
ALTER TABLE public.team_relationships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all read to authenticated" ON public.team_relationships;
CREATE POLICY "Allow all read to authenticated" ON public.team_relationships
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow write to ok admins" ON public.team_relationships;
CREATE POLICY "Allow write to ok admins" ON public.team_relationships
  FOR ALL TO authenticated USING (public.is_ok_admin());

-- 2. Add columns to teams
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS team_type TEXT;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS prefix VARCHAR(10);

-- Backfill unique prefixes
DO $$
DECLARE
  r RECORD;
  v_base VARCHAR(10);
  v_prefix VARCHAR(10);
  v_counter INT;
BEGIN
  FOR r IN SELECT id, name FROM public.teams WHERE prefix IS NULL OR prefix = '' LOOP
    v_base := upper(substring(regexp_replace(r.name, '\s+', '', 'g') from 1 for 3));
    IF v_base = '' OR v_base IS NULL THEN
      v_base := 'TSK';
    END IF;
    
    v_prefix := v_base;
    v_counter := 1;
    
    WHILE EXISTS (SELECT 1 FROM public.teams WHERE prefix = v_prefix) LOOP
      v_prefix := substring(v_base from 1 for 2) || v_counter::TEXT;
      v_counter := v_counter + 1;
    END LOOP;
    
    UPDATE public.teams SET prefix = v_prefix WHERE id = r.id;
  END LOOP;
END $$;

-- Enforce unique constraint
ALTER TABLE public.teams DROP CONSTRAINT IF EXISTS teams_prefix_key;
ALTER TABLE public.teams ADD CONSTRAINT teams_prefix_key UNIQUE (prefix);

-- 3. Recursive helper functions
CREATE OR REPLACE FUNCTION public.get_sub_teams_recursive(p_team_id UUID)
RETURNS TABLE (team_id UUID) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE sub_teams AS (
    SELECT child_id AS id
    FROM public.team_relationships
    WHERE parent_id = p_team_id
    UNION
    SELECT r.child_id
    FROM public.team_relationships r
    JOIN sub_teams st ON r.parent_id = st.id
  )
  SELECT id FROM sub_teams;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_parent_teams_recursive(p_team_id UUID)
RETURNS TABLE (team_id UUID) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE parent_teams AS (
    SELECT parent_id AS id
    FROM public.team_relationships
    WHERE child_id = p_team_id
    UNION
    SELECT r.parent_id
    FROM public.team_relationships r
    JOIN parent_teams pt ON r.child_id = pt.id
  )
  SELECT id FROM parent_teams;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Recreate select_messages policy with recursive sub-team read
DROP POLICY IF EXISTS select_messages ON public.messages;
CREATE POLICY select_messages ON public.messages
  FOR SELECT TO authenticated
  USING (
    sender_id = auth.uid()
    OR (recipient_type = 'user' AND recipient_id = auth.uid()::text AND public.can_chat_with(sender_id, auth.uid()))
    OR (recipient_type = 'team' AND EXISTS (
      SELECT 1 FROM public.user_teams ut
      WHERE ut.user_id = auth.uid()
      AND (
        ut.team_id::text = messages.recipient_id
        OR EXISTS (
          SELECT 1 FROM public.get_sub_teams_recursive(messages.recipient_id::uuid) st
          WHERE st.team_id = ut.team_id
        )
      )
    ))
    OR (recipient_type = 'group' AND public.is_group_member(messages.recipient_id::uuid, auth.uid()))
    OR (recipient_type = 'role' AND (
      messages.recipient_id = 'all'
      OR (messages.recipient_id = 'male' AND EXISTS (
        SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.gender = 'male'
      ))
      OR (messages.recipient_id = 'female' AND EXISTS (
        SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.gender = 'female'
      ))
      OR EXISTS (
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

-- 5. Recreate select_tasks and update_tasks policies to check recursively
DROP POLICY IF EXISTS select_tasks ON public.tasks;
CREATE POLICY select_tasks ON public.tasks
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR assigned_to = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_teams ut
      WHERE ut.user_id = auth.uid()
      AND (
        ut.team_id = tasks.team_id
        OR ut.team_id IN (SELECT team_id FROM public.get_parent_teams_recursive(tasks.team_id))
        OR ut.team_id IN (SELECT team_id FROM public.get_sub_teams_recursive(tasks.team_id))
      )
    )
  );

DROP POLICY IF EXISTS update_tasks ON public.tasks;
CREATE POLICY update_tasks ON public.tasks
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR assigned_to = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_teams ut
      WHERE ut.user_id = auth.uid()
      AND ut.access_level IN ('lead', 'oht', 'admin')
      AND (
        ut.team_id = tasks.team_id
        OR ut.team_id IN (SELECT team_id FROM public.get_parent_teams_recursive(tasks.team_id))
        OR ut.team_id IN (SELECT team_id FROM public.get_sub_teams_recursive(tasks.team_id))
      )
    )
  );

-- 6. Update tasks unique constraint to be per-team
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_task_number_key;
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_team_id_task_number_key;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_team_id_task_number_key UNIQUE (team_id, task_number);
