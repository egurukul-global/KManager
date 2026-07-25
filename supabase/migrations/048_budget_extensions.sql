-- Migration 048: Add wizard and accountability fields to budget plans
ALTER TABLE budget_plans
  ADD COLUMN IF NOT EXISTS open_budgets_explanation JSONB,
  ADD COLUMN IF NOT EXISTS recon_cash_balance NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS recon_bank_balance NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS recon_remaining_funds NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS submission_team_info JSONB,
  ADD COLUMN IF NOT EXISTS submission_housing_info JSONB,
  ADD COLUMN IF NOT EXISTS submission_accomplishments JSONB,
  ADD COLUMN IF NOT EXISTS submission_income_report JSONB,
  ADD COLUMN IF NOT EXISTS submission_social_media JSONB,
  ADD COLUMN IF NOT EXISTS submission_coursing JSONB;

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS is_frozen BOOLEAN NOT NULL DEFAULT false;
