-- Phase 4A: user request alias, approval platform foundation, budget approval status

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS request_alias VARCHAR(5),
  ADD COLUMN IF NOT EXISTS request_counter INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_request_alias_unique
  ON users (upper(trim(request_alias)))
  WHERE request_alias IS NOT NULL AND trim(request_alias) <> '';

COMMENT ON COLUMN users.request_alias IS '3-5 char unique alias for request numbers (e.g. TTM → TTM-42)';
COMMENT ON COLUMN users.request_counter IS 'Increments each time user creates a request or group number';

-- Approval requests (budget first; more types in 4B)
CREATE TABLE IF NOT EXISTS approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number TEXT NOT NULL,
  request_type TEXT NOT NULL DEFAULT 'budget',
  team_id UUID REFERENCES teams(id),
  status TEXT NOT NULL DEFAULT 'DRAFT',
  title TEXT,
  amount_usd NUMERIC(14, 2),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  group_number TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT approval_requests_number_unique UNIQUE (request_number)
);

CREATE INDEX IF NOT EXISTS idx_approval_requests_team ON approval_requests (team_id, status)
  WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_approval_requests_number ON approval_requests (request_number)
  WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_approval_requests_group ON approval_requests (group_number)
  WHERE group_number IS NOT NULL AND is_deleted = false;

CREATE TABLE IF NOT EXISTS approval_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_messages_request ON approval_messages (request_id, created_at DESC);

ALTER TABLE budget_plans
  ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS approval_request_id UUID REFERENCES approval_requests(id);

COMMENT ON COLUMN budget_plans.approval_status IS 'DRAFT | SUBMITTED | ROLE-REVIEWED | ROLE-APPROVED | REJECTED | CLARIFY-*';

-- Allocate next request number for a user (alias-counter)
CREATE OR REPLACE FUNCTION public.allocate_request_number(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alias text;
  v_counter integer;
BEGIN
  UPDATE users
  SET request_counter = request_counter + 1
  WHERE id = p_user_id
  RETURNING upper(trim(request_alias)), request_counter
  INTO v_alias, v_counter;

  IF v_alias IS NULL OR length(v_alias) < 3 THEN
    RAISE EXCEPTION 'Set a 3-5 character request alias in your profile first';
  END IF;

  RETURN v_alias || '-' || v_counter::text;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_request_number(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.allocate_request_number(uuid) TO authenticated;

ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS approval_requests_select ON approval_requests;
CREATE POLICY approval_requests_select ON approval_requests
  FOR SELECT TO authenticated
  USING (
    is_deleted = false
    AND (
      public.is_org_admin()
      OR created_by = auth.uid()
      OR team_id IN (SELECT ut.team_id FROM user_teams ut WHERE ut.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS approval_requests_insert ON approval_requests;
CREATE POLICY approval_requests_insert ON approval_requests
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS approval_requests_update ON approval_requests;
CREATE POLICY approval_requests_update ON approval_requests
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_org_admin())
  WITH CHECK (created_by = auth.uid() OR public.is_org_admin());

DROP POLICY IF EXISTS approval_messages_select ON approval_messages;
CREATE POLICY approval_messages_select ON approval_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM approval_requests ar
      WHERE ar.id = approval_messages.request_id
        AND ar.is_deleted = false
        AND (
          public.is_org_admin()
          OR ar.created_by = auth.uid()
          OR ar.team_id IN (SELECT ut.team_id FROM user_teams ut WHERE ut.user_id = auth.uid())
        )
    )
  );

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
        )
    )
  );

-- Users can update own alias + counter is function-only
DROP POLICY IF EXISTS users_update_own_alias ON users;
CREATE POLICY users_update_own_alias ON users
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
