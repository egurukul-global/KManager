-- Migration 056: Allow fin and fip org roles to manage budget plans (select and update)

DROP POLICY IF EXISTS budget_plans_select ON public.budget_plans;
DROP POLICY IF EXISTS budget_plans_insert ON public.budget_plans;
DROP POLICY IF EXISTS budget_plans_update ON public.budget_plans;
DROP POLICY IF EXISTS budget_plans_delete ON public.budget_plans;

-- 1. SELECT Policy
CREATE POLICY budget_plans_select ON public.budget_plans
  FOR SELECT TO authenticated
  USING (
    COALESCE(is_deleted, false) = false
    AND (
      -- Org admins / Global roles
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid()
          AND u.role IN ('admin', 'caoh', 'oh', 'ceo', 'fin', 'fip')
      )
      -- Creator of the budget plan
      OR created_by = auth.uid()
      -- Members of the team
      OR team_id IN (
        SELECT ut.team_id FROM public.user_teams ut WHERE ut.user_id = auth.uid()
      )
      -- Owner of the personal team
      OR team_id IN (
        SELECT t.id FROM public.teams t WHERE t.is_personal_team = true AND t.personal_owner_user_id = auth.uid()
      )
      -- User has a request role assignment for this team (approver)
      OR EXISTS (
        SELECT 1 FROM public.request_role_assignments rra
        WHERE rra.user_id = auth.uid()
          AND rra.is_active = true
          AND (rra.team_id IS NULL OR rra.team_id = budget_plans.team_id)
      )
      -- Associated with an approval request that the user can see
      OR EXISTS (
        SELECT 1 FROM public.approval_requests ar
        WHERE ar.budget_plan_id = budget_plans.id
          AND ar.is_deleted = false
          AND (
            ar.created_by = auth.uid()
            OR ar.team_id IN (SELECT ut.team_id FROM public.user_teams ut WHERE ut.user_id = auth.uid())
          )
      )
    )
  );

-- 2. INSERT Policy
CREATE POLICY budget_plans_insert ON public.budget_plans
  FOR INSERT TO authenticated
  WITH CHECK (
    -- Org admins / Global roles
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'caoh', 'oh', 'ceo', 'fin', 'fip')
    )
    -- Creator check
    OR created_by = auth.uid()
    -- Team leads/admins
    OR team_id IN (
      SELECT ut.team_id FROM public.user_teams ut
      WHERE ut.user_id = auth.uid()
        AND ut.access_level IN ('lead', 'admin')
    )
    -- Owner of the personal team
    OR team_id IN (
      SELECT t.id FROM public.teams t WHERE t.is_personal_team = true AND t.personal_owner_user_id = auth.uid()
    )
  );

-- 3. UPDATE Policy
CREATE POLICY budget_plans_update ON public.budget_plans
  FOR UPDATE TO authenticated
  USING (
    -- Org admins / Global roles
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
    -- Owner of the personal team
    OR team_id IN (
      SELECT t.id FROM public.teams t WHERE t.is_personal_team = true AND t.personal_owner_user_id = auth.uid()
    )
    -- User has active role assignment for this team (approver)
    OR EXISTS (
      SELECT 1 FROM public.request_role_assignments rra
      WHERE rra.user_id = auth.uid()
        AND rra.is_active = true
        AND (rra.team_id IS NULL OR rra.team_id = budget_plans.team_id)
    )
  )
  WITH CHECK (
    -- Org admins / Global roles
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
    -- Owner of the personal team
    OR team_id IN (
      SELECT t.id FROM public.teams t WHERE t.is_personal_team = true AND t.personal_owner_user_id = auth.uid()
    )
  );

-- 4. DELETE Policy
CREATE POLICY budget_plans_delete ON public.budget_plans
  FOR DELETE TO authenticated
  USING (
    -- Org admins / Global roles
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
    -- Owner of the personal team
    OR team_id IN (
      SELECT t.id FROM public.teams t WHERE t.is_personal_team = true AND t.personal_owner_user_id = auth.uid()
    )
  );
