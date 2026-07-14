-- Expand budget_plans.budget_type to match app budget types (was: monthly, adhoc only)

ALTER TABLE budget_plans
  DROP CONSTRAINT IF EXISTS budget_plans_budget_type_check;

ALTER TABLE budget_plans
  ADD CONSTRAINT budget_plans_budget_type_check
  CHECK (budget_type IN (
    'monthly',
    'medical',
    'travel',
    'passport-visa',
    'legal',
    'dr',
    'adhoc',
    'emergency',
    'shipping'
  ));

COMMENT ON COLUMN budget_plans.budget_type IS
  'monthly | medical | travel | passport-visa | legal | dr | adhoc | emergency | shipping';
