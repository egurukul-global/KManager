BEGIN;
DROP POLICY IF EXISTS report_logs_select ON public.report_logs;
CREATE POLICY report_logs_select ON public.report_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'caoh', 'oh', 'ceo', 'fin', 'fip')
    )
    OR created_by = auth.uid()
    OR team_id IN (
      SELECT ut.team_id FROM public.user_teams ut
      WHERE ut.user_id = auth.uid() AND ut.access_level IN ('owner', 'admin', 'editor')
    )
  );
COMMIT;
