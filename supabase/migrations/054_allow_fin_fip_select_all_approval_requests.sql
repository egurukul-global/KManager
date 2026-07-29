-- Migration 054: Allow fin and fip org roles to select all approval requests
DROP POLICY IF EXISTS approval_requests_select_global_roles ON public.approval_requests;

CREATE POLICY approval_requests_select_global_roles ON public.approval_requests
  FOR SELECT TO authenticated
  USING (
    is_deleted = false
    AND (
      EXISTS (
        SELECT 1 FROM public.request_role_assignments rra
        WHERE rra.user_id = auth.uid()
          AND rra.is_active = true
          AND (rra.team_id IS NULL OR rra.team_id = approval_requests.team_id)
      )
      OR EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid()
          AND u.role IN ('caoh', 'oh', 'admin', 'fin', 'fip')
      )
    )
  );
