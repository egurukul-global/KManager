-- Migration 055: Add paid_amount and funding_notes to budget_plans
ALTER TABLE public.budget_plans
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS funding_notes TEXT;
