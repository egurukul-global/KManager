-- Migration 059: Create expense_attachments table and define RLS policies

CREATE TABLE IF NOT EXISTS public.expense_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL,
  expense_id UUID REFERENCES public.expenses(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  is_deleted BOOLEAN DEFAULT false,
  deleted_at TIMESTAMPTZ
);

ALTER TABLE public.expense_attachments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS expense_attachments_select ON public.expense_attachments;
DROP POLICY IF EXISTS expense_attachments_insert ON public.expense_attachments;
DROP POLICY IF EXISTS expense_attachments_update ON public.expense_attachments;
DROP POLICY IF EXISTS expense_attachments_delete ON public.expense_attachments;

-- SELECT Policy: users can view attachments for expenses they can see
CREATE POLICY expense_attachments_select ON public.expense_attachments
  FOR SELECT TO authenticated
  USING (
    is_deleted = false
    AND (
      -- Global roles / Org admins
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid()
          AND u.role IN ('admin', 'caoh', 'oh', 'ceo', 'fin', 'fip')
      )
      -- Creator
      OR created_by = auth.uid()
      -- Team members
      OR team_id IN (
        SELECT ut.team_id FROM public.user_teams ut WHERE ut.user_id = auth.uid()
      )
    )
  );

-- INSERT Policy: team members/leads can upload attachments
CREATE POLICY expense_attachments_insert ON public.expense_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    -- Creator
    created_by = auth.uid()
    AND (
      -- Global roles / Org admins
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid()
          AND u.role IN ('admin', 'caoh', 'oh', 'ceo', 'fin', 'fip')
      )
      -- Team members
      OR team_id IN (
        SELECT ut.team_id FROM public.user_teams ut WHERE ut.user_id = auth.uid()
      )
    )
  );

-- UPDATE Policy: creator or team admins/leads can update
CREATE POLICY expense_attachments_update ON public.expense_attachments
  FOR UPDATE TO authenticated
  USING (
    -- Global roles / Org admins
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'caoh', 'oh', 'ceo', 'fin', 'fip')
    )
    -- Creator
    OR created_by = auth.uid()
    -- Team leads/admins
    OR team_id IN (
      SELECT ut.team_id FROM public.user_teams ut
      WHERE ut.user_id = auth.uid()
        AND ut.access_level IN ('lead', 'admin')
    )
  );

-- DELETE Policy: creator or team admins/leads can delete
CREATE POLICY expense_attachments_delete ON public.expense_attachments
  FOR DELETE TO authenticated
  USING (
    -- Global roles / Org admins
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'caoh', 'oh', 'ceo', 'fin', 'fip')
    )
    -- Creator
    OR created_by = auth.uid()
    -- Team leads/admins
    OR team_id IN (
      SELECT ut.team_id FROM public.user_teams ut
      WHERE ut.user_id = auth.uid()
        AND ut.access_level IN ('lead', 'admin')
    )
  );
