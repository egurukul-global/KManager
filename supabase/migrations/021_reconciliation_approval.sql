-- Phase 4C: reconciliation balance adjustment approvals (OPH → FIN → FIH → CAO)

-- ==================== LINK TABLE ====================

CREATE TABLE IF NOT EXISTS approval_request_reconciliation_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
  reconciliation_line_id UUID NOT NULL REFERENCES reconciliation_lines(id) ON DELETE CASCADE,
  reconciliation_submission_id UUID REFERENCES reconciliation_submissions(id) ON DELETE SET NULL,
  bucket_id UUID NOT NULL,
  bucket_name TEXT,
  currency TEXT,
  closing_balance NUMERIC(18,2),
  actual_balance NUMERIC(18,2),
  difference NUMERIC(18,2),
  usd_equivalent NUMERIC(18,2),
  comments TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (request_id, reconciliation_line_id)
);

CREATE INDEX IF NOT EXISTS idx_approval_recon_lines_request
  ON approval_request_reconciliation_lines (request_id);

CREATE INDEX IF NOT EXISTS idx_approval_recon_lines_recon_line
  ON approval_request_reconciliation_lines (reconciliation_line_id);

-- ==================== EXTEND RECONCILIATION LINES ====================

ALTER TABLE reconciliation_lines
  ADD COLUMN IF NOT EXISTS adjustment_status TEXT;

COMMENT ON COLUMN reconciliation_lines.adjustment_status IS
  'null=open, pending=in approval, approved=balance adjusted, rejected=approval denied';

-- ==================== EXTEND APPROVAL REQUESTS ====================

ALTER TABLE approval_requests
  ADD COLUMN IF NOT EXISTS reconciliation_submission_id UUID REFERENCES reconciliation_submissions(id);

CREATE INDEX IF NOT EXISTS idx_approval_requests_recon
  ON approval_requests (reconciliation_submission_id)
  WHERE reconciliation_submission_id IS NOT NULL AND is_deleted = false;

-- ==================== DEFAULT FLOW: OPH → FIN → FIH → CAO ====================

INSERT INTO approval_flow_definitions (id, request_type, team_id, user_id, priority, is_active)
SELECT gen_random_uuid(), 'reconciliation_adjustment', NULL, NULL, 0, true
WHERE NOT EXISTS (
  SELECT 1 FROM approval_flow_definitions
  WHERE request_type = 'reconciliation_adjustment' AND team_id IS NULL AND user_id IS NULL
);

INSERT INTO approval_flow_steps (flow_id, step_order, role_code, is_final)
SELECT f.id, s.step_order, s.role_code, s.is_final
FROM approval_flow_definitions f
CROSS JOIN (VALUES
  (1, 'OPH', false),
  (2, 'FIN', false),
  (3, 'FIH', false),
  (4, 'CAO', true)
) AS s(step_order, role_code, is_final)
WHERE f.request_type = 'reconciliation_adjustment' AND f.team_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM approval_flow_steps fs WHERE fs.flow_id = f.id);

-- ==================== RLS ====================

ALTER TABLE approval_request_reconciliation_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS approval_recon_lines_select ON approval_request_reconciliation_lines;
CREATE POLICY approval_recon_lines_select ON approval_request_reconciliation_lines
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM approval_requests ar
      WHERE ar.id = approval_request_reconciliation_lines.request_id
        AND ar.is_deleted = false
        AND (
          public.is_org_admin()
          OR ar.created_by = auth.uid()
          OR ar.team_id IN (SELECT ut.team_id FROM user_teams ut WHERE ut.user_id = auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS approval_recon_lines_insert ON approval_request_reconciliation_lines;
CREATE POLICY approval_recon_lines_insert ON approval_request_reconciliation_lines
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM approval_requests ar
      WHERE ar.id = approval_request_reconciliation_lines.request_id
        AND ar.created_by = auth.uid()
        AND ar.is_deleted = false
    )
  );

-- ==================== APPLY ADJUSTMENT (on final approval) ====================

CREATE OR REPLACE FUNCTION public.apply_reconciliation_adjustment_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req approval_requests%ROWTYPE;
  v_link RECORD;
BEGIN
  SELECT * INTO v_req FROM approval_requests
  WHERE id = p_request_id AND is_deleted = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF v_req.request_type <> 'reconciliation_adjustment' THEN
    RAISE EXCEPTION 'Not a reconciliation adjustment request';
  END IF;

  IF v_req.status NOT LIKE '%-APPROVED' OR v_req.status = 'REJECTED' THEN
    RAISE EXCEPTION 'Request is not approved';
  END IF;

  FOR v_link IN
    SELECT * FROM approval_request_reconciliation_lines WHERE request_id = p_request_id
  LOOP
    -- Apply only the recorded mismatch to the *current* balance (not absolute actual).
    -- difference = actual − closing at reconcile time; income/expenses since then stay reflected.
    IF v_link.bucket_id IS NOT NULL AND v_link.difference IS NOT NULL
       AND abs(v_link.difference) >= 0.01 THEN
      UPDATE buckets
      SET balance = COALESCE(balance, 0) + v_link.difference,
          updated_at = now()
      WHERE id = v_link.bucket_id;
    END IF;
    IF v_link.reconciliation_line_id IS NOT NULL THEN
      UPDATE reconciliation_lines SET adjustment_status = 'approved' WHERE id = v_link.reconciliation_line_id;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_reconciliation_adjustment_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_reconciliation_adjustment_request(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_reconciliation_adjustment_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req approval_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_req FROM approval_requests
  WHERE id = p_request_id AND is_deleted = false;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_req.request_type <> 'reconciliation_adjustment' THEN
    RETURN;
  END IF;

  UPDATE reconciliation_lines rl
  SET adjustment_status = 'rejected'
  FROM approval_request_reconciliation_lines arl
  WHERE arl.request_id = p_request_id
    AND arl.reconciliation_line_id = rl.id;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_reconciliation_adjustment_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_reconciliation_adjustment_request(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_reconciliation_adjustment_pending(p_line_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_line_ids IS NULL OR array_length(p_line_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  UPDATE reconciliation_lines rl
  SET adjustment_status = 'pending'
  FROM reconciliation_submissions rs
  WHERE rl.id = ANY(p_line_ids)
    AND rs.id = rl.submission_id
    AND rs.is_deleted = false
    AND rs.team_id IN (SELECT ut.team_id FROM user_teams ut WHERE ut.user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM user_teams ut
      WHERE ut.user_id = auth.uid()
        AND ut.team_id = rs.team_id
        AND lower(trim(ut.access_level)) NOT IN ('view', 'oht')
    )
    AND abs(COALESCE(rl.difference, 0)) >= 0.01
    AND COALESCE(lower(trim(rl.adjustment_status)), '') NOT IN ('pending', 'approved');
END;
$$;

REVOKE ALL ON FUNCTION public.mark_reconciliation_adjustment_pending(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_reconciliation_adjustment_pending(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_reconciliation_adjustment_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req approval_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_req FROM approval_requests
  WHERE id = p_request_id AND is_deleted = false;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_req.request_type <> 'reconciliation_adjustment' THEN
    RETURN;
  END IF;

  IF v_req.created_by IS DISTINCT FROM auth.uid()
     AND NOT public.is_org_admin() THEN
    RAISE EXCEPTION 'Only the requester can cancel this request';
  END IF;

  UPDATE reconciliation_lines rl
  SET adjustment_status = NULL
  FROM approval_request_reconciliation_lines arl
  WHERE arl.request_id = p_request_id
    AND arl.reconciliation_line_id = rl.id
    AND rl.adjustment_status = 'pending';
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_reconciliation_adjustment_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_reconciliation_adjustment_request(uuid) TO authenticated;
