-- Fix: editing ANY field on an income record (even something unrelated like a description)
-- could fail with "violates check constraint chk_bucket_balance_non_negative" if the
-- linked bucket's balance was currently low - even though the net effect of the edit
-- should be zero. Found while testing the 20260906000000 migration.
--
-- Root cause: on UPDATE, when the bucket didn't change, the old function did two
-- SEPARATE statements against the same bucket row - "subtract old amount" then
-- "add new amount" - each checked against the non-negative constraint immediately.
-- If current balance was less than the old amount, the intermediate subtract-only
-- state could dip negative and fail, even though old amount ≈ new amount and the
-- final result would have been fine.
--
-- Fix: when the bucket is unchanged, apply the net delta (old subtracted + new added)
-- in a single UPDATE statement, so the constraint is checked once against the final
-- correct value, not an artificial intermediate one. When the bucket DOES change,
-- the two updates touch two different rows, so there's no intermediate-state risk -
-- that path is unchanged.
--
-- Rollback: see the paired _ROLLBACK.sql file, which restores the exact original
-- function body captured from the live database before this change.

CREATE OR REPLACE FUNCTION public.handle_income_balance_impact()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.balance_impact = true AND COALESCE(NEW.is_deleted, false) = false AND NEW.bucket_id IS NOT NULL THEN
      UPDATE public.buckets
      SET balance = COALESCE(balance, 0) + COALESCE(NEW.local_amount, 0),
          updated_at = now()
      WHERE id = NEW.bucket_id;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.bucket_id IS NOT DISTINCT FROM NEW.bucket_id THEN
      -- Same bucket: apply the net delta in ONE statement (atomic w.r.t. the check
      -- constraint) instead of subtract-then-add as two statements.
      IF NEW.bucket_id IS NOT NULL THEN
        UPDATE public.buckets
        SET balance = COALESCE(balance, 0)
              - (CASE WHEN OLD.balance_impact = true AND COALESCE(OLD.is_deleted, false) = false
                      THEN COALESCE(OLD.local_amount, 0) ELSE 0 END)
              + (CASE WHEN NEW.balance_impact = true AND COALESCE(NEW.is_deleted, false) = false
                      THEN COALESCE(NEW.local_amount, 0) ELSE 0 END),
            updated_at = now()
        WHERE id = NEW.bucket_id;
      END IF;
    ELSE
      -- Bucket changed: two different rows, so no same-row transient-state risk.
      IF OLD.balance_impact = true AND COALESCE(OLD.is_deleted, false) = false AND OLD.bucket_id IS NOT NULL THEN
        UPDATE public.buckets
        SET balance = COALESCE(balance, 0) - COALESCE(OLD.local_amount, 0),
            updated_at = now()
        WHERE id = OLD.bucket_id;
      END IF;
      IF NEW.balance_impact = true AND COALESCE(NEW.is_deleted, false) = false AND NEW.bucket_id IS NOT NULL THEN
        UPDATE public.buckets
        SET balance = COALESCE(balance, 0) + COALESCE(NEW.local_amount, 0),
            updated_at = now()
        WHERE id = NEW.bucket_id;
      END IF;
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.balance_impact = true AND COALESCE(OLD.is_deleted, false) = false AND OLD.bucket_id IS NOT NULL THEN
      UPDATE public.buckets
      SET balance = COALESCE(balance, 0) - COALESCE(OLD.local_amount, 0),
          updated_at = now()
      WHERE id = OLD.bucket_id;
    END IF;
  END IF;

  RETURN NULL;
END;
$function$
