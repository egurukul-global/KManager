-- Approvers (FIN/FIH/etc.) need to read the linked budget/transfer when reviewing.

-- Budget plans visible when linked to an approval the user may see
DROP POLICY IF EXISTS budget_plans_select_approval_assignee ON public.budget_plans;
CREATE POLICY budget_plans_select_approval_assignee ON public.budget_plans
  FOR SELECT TO authenticated
  USING (
    COALESCE(is_deleted, false) = false
    AND EXISTS (
      SELECT 1
      FROM public.approval_requests ar
      WHERE ar.budget_plan_id = budget_plans.id
        AND ar.is_deleted = false
        AND (
          ar.created_by = auth.uid()
          OR public.is_org_admin()
          OR (
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
          OR ar.team_id IN (
            SELECT ut.team_id FROM public.user_teams ut WHERE ut.user_id = auth.uid()
          )
        )
    )
  );

-- Transfers visible when linked to an approval the user may see
DROP POLICY IF EXISTS transfers_select_approval_assignee ON public.transfers;
CREATE POLICY transfers_select_approval_assignee ON public.transfers
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.approval_requests ar
      WHERE ar.transfer_id = transfers.id
        AND ar.is_deleted = false
        AND (
          ar.created_by = auth.uid()
          OR public.is_org_admin()
          OR (
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
          OR ar.team_id IN (
            SELECT ut.team_id FROM public.user_teams ut WHERE ut.user_id = auth.uid()
          )
        )
    )
  );

-- Reliable read for review modal (bypasses team-only RLS when allowed)
CREATE OR REPLACE FUNCTION public.get_budget_plan_for_review(p_budget_plan_id uuid)
RETURNS SETOF public.budget_plans
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_budget_plan_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.approval_requests ar
    WHERE ar.budget_plan_id = p_budget_plan_id
      AND ar.is_deleted = false
      AND (
        ar.created_by = auth.uid()
        OR public.is_org_admin()
        OR (
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
        OR ar.team_id IN (
          SELECT ut.team_id FROM public.user_teams ut WHERE ut.user_id = auth.uid()
        )
      )
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.budget_plans bp
  WHERE bp.id = p_budget_plan_id
    AND COALESCE(bp.is_deleted, false) = false;
END;
$$;

REVOKE ALL ON FUNCTION public.get_budget_plan_for_review(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_budget_plan_for_review(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_transfer_for_review(p_transfer_id uuid)
RETURNS SETOF public.transfers
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_transfer_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.approval_requests ar
    WHERE ar.transfer_id = p_transfer_id
      AND ar.is_deleted = false
      AND (
        ar.created_by = auth.uid()
        OR public.is_org_admin()
        OR (
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
        OR ar.team_id IN (
          SELECT ut.team_id FROM public.user_teams ut WHERE ut.user_id = auth.uid()
        )
      )
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.transfers t
  WHERE t.id = p_transfer_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_transfer_for_review(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_transfer_for_review(uuid) TO authenticated;
