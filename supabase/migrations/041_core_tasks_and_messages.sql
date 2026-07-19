-- Migration 041: Create Core Tasks and Messages Tables, and drop legacy approval_comments

-- 1. Create public.tasks table
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_number TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'completed', 'backlog')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  
  -- Unification / Context Fields
  context_app TEXT CHECK (context_app IN ('finance', 'gurukul', 'legal', 'ops')),
  context_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for tasks
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_tasks ON public.tasks
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR assigned_to = auth.uid()
    -- Member of the team owning the task
    OR EXISTS (
      SELECT 1 FROM public.user_teams ut
      WHERE ut.team_id = tasks.team_id AND ut.user_id = auth.uid()
    )
  );

CREATE POLICY insert_tasks ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_teams ut
      WHERE ut.team_id = team_id AND ut.user_id = auth.uid()
    )
  );

CREATE POLICY update_tasks ON public.tasks
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR assigned_to = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_teams ut
      WHERE ut.team_id = tasks.team_id AND ut.user_id = auth.uid() AND ut.access_level IN ('lead', 'oht', 'admin')
    )
  );

-- 2. Create public.messages table
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  
  -- Recipient Routing
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('user', 'team', 'role')),
  recipient_id TEXT NOT NULL, -- Holds UUID for user/team, or Role Code (e.g. 'CAO', 'FIH')
  
  -- Content
  body TEXT NOT NULL,
  attachment_url TEXT,
  attachment_name TEXT,
  
  -- Flags & Metadata
  allow_replies BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for messages
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_messages ON public.messages
  FOR SELECT TO authenticated
  USING (
    sender_id = auth.uid()
    OR (recipient_type = 'user' AND recipient_id = auth.uid()::text)
    -- Group messages where user is in the team
    OR (recipient_type = 'team' AND EXISTS (
      SELECT 1 FROM public.user_teams ut
      WHERE ut.team_id::text = messages.recipient_id AND ut.user_id = auth.uid()
    ))
    -- Role messages where user holds the active role assignment
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
    -- Fallback for budget discussion link messages (if user can see the linked request)
    OR (metadata->>'link_type' = 'budget' AND EXISTS (
      SELECT 1 FROM public.approval_requests r
      WHERE r.id::text = messages.metadata->>'link_id'
    ))
  );

CREATE POLICY insert_messages ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
  );

-- 3. Drop legacy approval_comments table
DROP TABLE IF EXISTS public.approval_comments CASCADE;
