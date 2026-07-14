-- FIN / FIH / etc. get notified but could not SELECT approval_requests
-- (they often have request_role_assignments only, not user_teams).
-- Broaden select so assignees see team requests and act when it's their step.

DROP POLICY IF EXISTS approval_requests_select_assignee ON public.approval_requests;
CREATE POLICY approval_requests_select_assignee ON public.approval_requests
  FOR SELECT TO authenticated
  USING (
    is_deleted = false
    AND (
      -- Waiting for this user's role on this team
      (
        current_role_code IS NOT NULL
        AND public.user_has_approval_role(auth.uid(), current_role_code, team_id)
      )
      -- Or user holds any active role assignment for this team (inbox + All filters)
      OR EXISTS (
        SELECT 1
        FROM public.request_role_assignments rra
        WHERE rra.user_id = auth.uid()
          AND rra.is_active = true
          AND (rra.team_id IS NULL OR rra.team_id = approval_requests.team_id)
      )
    )
  );

DROP POLICY IF EXISTS approval_messages_select_assignee ON public.approval_messages;
CREATE POLICY approval_messages_select_assignee ON public.approval_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.approval_requests ar
      WHERE ar.id = approval_messages.request_id
        AND ar.is_deleted = false
        AND (
          (
            ar.current_role_code IS NOT NULL
            AND public.user_has_approval_role(auth.uid(), ar.current_role_code, ar.team_id)
          )
          OR EXISTS (
            SELECT 1
            FROM public.request_role_assignments rra
            WHERE rra.user_id = auth.uid()
              AND rra.is_active = true
              AND (rra.team_id IS NULL OR rra.team_id = ar.team_id)
          )
        )
    )
  );

-- Ensure teams named in the portal are readable for assignees
DROP POLICY IF EXISTS teams_select_role_assignment ON public.teams;
CREATE POLICY teams_select_role_assignment ON public.teams
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.request_role_assignments rra
      WHERE rra.user_id = auth.uid()
        AND rra.is_active = true
        AND (rra.team_id IS NULL OR rra.team_id = teams.id)
    )
  );
