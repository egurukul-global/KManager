-- Patch: reconciliation approval applies difference only; add cancel RPC

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

REVOKE ALL ON FUNCTION public.apply_reconciliation_adjustment_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_reconciliation_adjustment_request(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.cancel_reconciliation_adjustment_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_reconciliation_adjustment_request(uuid) TO authenticated;
