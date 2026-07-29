-- Migration 057: Fix income trigger to update bucket balance using local_amount instead of amount_usd
CREATE OR REPLACE FUNCTION public.handle_income_balance_impact()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger on public.income
DROP TRIGGER IF EXISTS trg_income_balance_impact ON public.income;
DROP TRIGGER IF EXISTS income_balance_impact_trigger ON public.income;
DROP TRIGGER IF EXISTS handle_income_balance_impact ON public.income;

CREATE TRIGGER trg_income_balance_impact
  AFTER INSERT OR UPDATE OR DELETE ON public.income
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_income_balance_impact();
