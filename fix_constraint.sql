ALTER TABLE budget_plans DROP CONSTRAINT IF EXISTS budget_plans_budget_type_check;
ALTER TABLE budget_plans ADD CONSTRAINT budget_plans_budget_type_check CHECK (budget_type = ANY (ARRAY['monthly'::text, 'medical'::text, 'travel'::text, 'passport-visa'::text, 'legal'::text, 'dr'::text, 'adhoc'::text, 'emergency'::text, 'shipping'::text, 'unallocated'::text]));
