-- Phase 4B: approval flows, role assignments, extended request lifecycle

-- ==================== FLOW DEFINITIONS ====================

CREATE TABLE IF NOT EXISTS approval_flow_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type TEXT NOT NULL,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_flow_defs_lookup
  ON approval_flow_definitions (request_type, is_active, priority DESC);

CREATE TABLE IF NOT EXISTS approval_flow_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES approval_flow_definitions(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  role_code TEXT NOT NULL,
  is_final BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (flow_id, step_order)
);

CREATE INDEX IF NOT EXISTS idx_approval_flow_steps_flow
  ON approval_flow_steps (flow_id, step_order);

-- ==================== REQUEST ROLE ASSIGNMENTS (FIN, LEG, …) ====================

CREATE TABLE IF NOT EXISTS request_role_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_code TEXT NOT NULL,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  request_type TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  assigned_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_request_role_assignments_unique
  ON request_role_assignments (
    user_id,
    upper(role_code),
    COALESCE(team_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(request_type, '')
  )
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_request_role_assignments_lookup
  ON request_role_assignments (role_code, team_id)
  WHERE is_active = true;

-- ==================== EXTEND APPROVAL REQUESTS ====================

ALTER TABLE approval_requests
  ADD COLUMN IF NOT EXISTS current_step_order INTEGER,
  ADD COLUMN IF NOT EXISTS current_role_code TEXT,
  ADD COLUMN IF NOT EXISTS budget_plan_id UUID REFERENCES budget_plans(id),
  ADD COLUMN IF NOT EXISTS transfer_id UUID REFERENCES transfers(id),
  ADD COLUMN IF NOT EXISTS step_approved BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_approval_requests_inbox
  ON approval_requests (status, current_role_code, team_id)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_approval_requests_budget
  ON approval_requests (budget_plan_id)
  WHERE budget_plan_id IS NOT NULL AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_approval_requests_transfer
  ON approval_requests (transfer_id)
  WHERE transfer_id IS NOT NULL AND is_deleted = false;

-- ==================== ROLE CHECK HELPERS ====================

CREATE OR REPLACE FUNCTION public.user_has_approval_role(
  p_user_id uuid,
  p_role_code text,
  p_team_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := upper(trim(COALESCE(p_role_code, '')));
  v_org_role text;
BEGIN
  IF v_role = '' OR p_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT role INTO v_org_role FROM users WHERE id = p_user_id;

  IF v_role = 'CAO' AND v_org_role IN ('caoh', 'admin') THEN
    RETURN true;
  END IF;

  IF v_role = 'FIH' AND v_org_role IN ('oh', 'caoh', 'admin') THEN
    RETURN true;
  END IF;

  IF v_role = 'CEO' AND v_org_role = 'ceo' THEN
    RETURN true;
  END IF;

  IF v_role = 'SYS' AND v_org_role = 'admin' THEN
    RETURN true;
  END IF;

  IF p_team_id IS NOT NULL THEN
    IF v_role = 'OPH' AND EXISTS (
      SELECT 1 FROM user_teams ut
      WHERE ut.user_id = p_user_id AND ut.team_id = p_team_id AND ut.access_level = 'oht'
    ) THEN
      RETURN true;
    END IF;

    IF v_role = 'OPL' AND EXISTS (
      SELECT 1 FROM user_teams ut
      WHERE ut.user_id = p_user_id AND ut.team_id = p_team_id AND ut.access_level = 'lead'
    ) THEN
      RETURN true;
    END IF;

    IF v_role = 'OPS' AND EXISTS (
      SELECT 1 FROM user_teams ut
      WHERE ut.user_id = p_user_id AND ut.team_id = p_team_id AND ut.access_level = 'member'
    ) THEN
      RETURN true;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM request_role_assignments rra
    WHERE rra.user_id = p_user_id
      AND upper(rra.role_code) = v_role
      AND rra.is_active = true
      AND (rra.team_id IS NULL OR rra.team_id = p_team_id)
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.user_has_approval_role(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_has_approval_role(uuid, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.user_can_act_on_approval_request(p_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req approval_requests%ROWTYPE;
  v_clarify_role text;
BEGIN
  SELECT * INTO v_req FROM approval_requests
  WHERE id = p_request_id AND is_deleted = false;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF public.is_org_admin() THEN
    RETURN true;
  END IF;

  IF v_req.status = 'REJECTED' OR v_req.status LIKE '%-APPROVED' THEN
    RETURN false;
  END IF;

  IF v_req.status LIKE 'CLARIFY-%' THEN
    v_clarify_role := substring(v_req.status from 9);
    RETURN public.user_has_approval_role(auth.uid(), v_clarify_role, v_req.team_id)
      OR v_req.created_by = auth.uid();
  END IF;

  IF v_req.current_role_code IS NOT NULL THEN
    RETURN public.user_has_approval_role(auth.uid(), v_req.current_role_code, v_req.team_id);
  END IF;

  RETURN v_req.created_by = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.user_can_act_on_approval_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_act_on_approval_request(uuid) TO authenticated;

-- ==================== DEFAULT FLOWS ====================

INSERT INTO approval_flow_definitions (id, request_type, team_id, user_id, priority, is_active)
SELECT gen_random_uuid(), 'budget', NULL, NULL, 0, true
WHERE NOT EXISTS (
  SELECT 1 FROM approval_flow_definitions
  WHERE request_type = 'budget' AND team_id IS NULL AND user_id IS NULL
);

INSERT INTO approval_flow_definitions (id, request_type, team_id, user_id, priority, is_active)
SELECT gen_random_uuid(), 'money_transfer', NULL, NULL, 0, true
WHERE NOT EXISTS (
  SELECT 1 FROM approval_flow_definitions
  WHERE request_type = 'money_transfer' AND team_id IS NULL AND user_id IS NULL
);

-- Budget: OPH → FIN → FIH → CAO
INSERT INTO approval_flow_steps (flow_id, step_order, role_code, is_final)
SELECT f.id, s.step_order, s.role_code, s.is_final
FROM approval_flow_definitions f
CROSS JOIN (VALUES
  (1, 'OPH', false),
  (2, 'FIN', false),
  (3, 'FIH', false),
  (4, 'CAO', true)
) AS s(step_order, role_code, is_final)
WHERE f.request_type = 'budget' AND f.team_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM approval_flow_steps fs WHERE fs.flow_id = f.id);

-- Money transfer (cross-team): FIH final
INSERT INTO approval_flow_steps (flow_id, step_order, role_code, is_final)
SELECT f.id, s.step_order, s.role_code, s.is_final
FROM approval_flow_definitions f
CROSS JOIN (VALUES
  (1, 'FIH', true)
) AS s(step_order, role_code, is_final)
WHERE f.request_type = 'money_transfer' AND f.team_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM approval_flow_steps fs WHERE fs.flow_id = f.id);

-- ==================== RLS ====================

ALTER TABLE approval_flow_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_flow_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_role_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS approval_flow_definitions_select ON approval_flow_definitions;
CREATE POLICY approval_flow_definitions_select ON approval_flow_definitions
  FOR SELECT TO authenticated
  USING (is_active = true OR public.is_org_admin());

DROP POLICY IF EXISTS approval_flow_steps_select ON approval_flow_steps;
CREATE POLICY approval_flow_steps_select ON approval_flow_steps
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM approval_flow_definitions d
      WHERE d.id = approval_flow_steps.flow_id AND (d.is_active = true OR public.is_org_admin())
    )
  );

DROP POLICY IF EXISTS request_role_assignments_select ON request_role_assignments;
CREATE POLICY request_role_assignments_select ON request_role_assignments
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_org_admin()
    OR team_id IN (SELECT ut.team_id FROM user_teams ut WHERE ut.user_id = auth.uid())
  );

DROP POLICY IF EXISTS request_role_assignments_manage ON request_role_assignments;
CREATE POLICY request_role_assignments_manage ON request_role_assignments
  FOR ALL TO authenticated
  USING (public.is_org_admin() OR EXISTS (
    SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('oh', 'caoh', 'admin')
  ))
  WITH CHECK (public.is_org_admin() OR EXISTS (
    SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('oh', 'caoh', 'admin')
  ));

-- Broaden approval_requests update for approvers
DROP POLICY IF EXISTS approval_requests_update ON approval_requests;
CREATE POLICY approval_requests_update ON approval_requests
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR public.is_org_admin()
    OR public.user_can_act_on_approval_request(id)
  )
  WITH CHECK (
    created_by = auth.uid()
    OR public.is_org_admin()
    OR public.user_can_act_on_approval_request(id)
  );

-- Approvers can insert messages
DROP POLICY IF EXISTS approval_messages_insert ON approval_messages;
CREATE POLICY approval_messages_insert ON approval_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM approval_requests ar
      WHERE ar.id = approval_messages.request_id
        AND ar.is_deleted = false
        AND (
          ar.created_by = auth.uid()
          OR public.is_org_admin()
          OR ar.team_id IN (SELECT ut.team_id FROM user_teams ut WHERE ut.user_id = auth.uid())
          OR public.user_can_act_on_approval_request(ar.id)
        )
    )
  );
