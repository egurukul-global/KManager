-- Rollback for 20260906000001_fix_income_balance_impact_atomicity.sql
-- Restores the exact original function body, captured from the live database
-- before this change, via CREATE OR REPLACE (safe - same function signature).

CREATE OR REPLACE FUNCTION public.handle_income_balance_impact()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.balance_impact = true AND COALESCE(NEW.is_deleted, false) = false AND NEW.bucket_id IS NOT NULL THEN
      UPDATE public.buckets
      SET balance = COALESCE(balance, 0) + NEW.local_amount,
          updated_at = now()
      WHERE id = NEW.bucket_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Subtract old amount from old bucket
    IF OLD.balance_impact = true AND COALESCE(OLD.is_deleted, false) = false AND OLD.bucket_id IS NOT NULL THEN
      UPDATE public.buckets
      SET balance = COALESCE(balance, 0) - OLD.local_amount,
          updated_at = now()
      WHERE id = OLD.bucket_id;
    END IF;
    -- Add new amount to new bucket
    IF NEW.balance_impact = true AND COALESCE(NEW.is_deleted, false) = false AND NEW.bucket_id IS NOT NULL THEN
      UPDATE public.buckets
      SET balance = COALESCE(balance, 0) + NEW.local_amount,
          updated_at = now()
      WHERE id = NEW.bucket_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.balance_impact = true AND COALESCE(OLD.is_deleted, false) = false AND OLD.bucket_id IS NOT NULL THEN
      UPDATE public.buckets
      SET balance = COALESCE(balance, 0) - OLD.local_amount,
          updated_at = now()
      WHERE id = OLD.bucket_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$function$
