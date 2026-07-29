-- Migration 060: Create report_logs table and RLS policies

CREATE TABLE IF NOT EXISTS public.report_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL,
  budget_id UUID REFERENCES public.budget_plans(id) ON DELETE SET NULL,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  sections JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'in_progress', -- 'in_progress', 'completed', 'failed'
  file_url TEXT,
  error_message TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  is_deleted BOOLEAN DEFAULT false,
  deleted_at TIMESTAMPTZ
);

ALTER TABLE public.report_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS report_logs_select ON public.report_logs;
DROP POLICY IF EXISTS report_logs_insert ON public.report_logs;
DROP POLICY IF EXISTS report_logs_update ON public.report_logs;
DROP POLICY IF EXISTS report_logs_delete ON public.report_logs;

-- SELECT
CREATE POLICY report_logs_select ON public.report_logs
  FOR SELECT TO authenticated
  USING (
    is_deleted = false
    AND (
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid()
          AND u.role IN ('admin', 'caoh', 'oh', 'ceo', 'fin', 'fip')
      )
      OR created_by = auth.uid()
      OR team_id IN (
        SELECT ut.team_id FROM public.user_teams ut WHERE ut.user_id = auth.uid()
      )
    )
  );

-- INSERT
CREATE POLICY report_logs_insert ON public.report_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid()
          AND u.role IN ('admin', 'caoh', 'oh', 'ceo', 'fin', 'fip')
      )
      OR team_id IN (
        SELECT ut.team_id FROM public.user_teams ut WHERE ut.user_id = auth.uid()
      )
    )
  );

-- UPDATE
CREATE POLICY report_logs_update ON public.report_logs
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'caoh', 'oh', 'ceo', 'fin', 'fip')
    )
    OR created_by = auth.uid()
    OR team_id IN (
      SELECT ut.team_id FROM public.user_teams ut
      WHERE ut.user_id = auth.uid()
        AND ut.access_level IN ('lead', 'admin')
    )
  );

-- DELETE
CREATE POLICY report_logs_delete ON public.report_logs
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'caoh', 'oh', 'ceo', 'fin', 'fip')
    )
    OR created_by = auth.uid()
    OR team_id IN (
      SELECT ut.team_id FROM public.user_teams ut
      WHERE ut.user_id = auth.uid()
        AND ut.access_level IN ('lead', 'admin')
    )
  );
