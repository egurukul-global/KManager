-- ================================================================
-- GLOBAL BUDGET TYPES + TEMPLATES (org-wide) + budget_plans.template_id
-- ----------------------------------------------------------------
-- Budgets stay team-scoped (budget_plans.team_id unchanged).
-- Budget types  → org-global definitions with a stable text `code`.
-- Templates     → org-global definitions (no team_id).
-- Assignments   → org-global, keyed by the text budget type `code`.
-- budget_plans  → gets nullable `template_id` FK (ON DELETE SET NULL).
-- Removes the hard-coded budget_plans.budget_type CHECK constraint.
-- Old budgets are untouched (categories are stored snapshots).
-- ================================================================

-- ----------------------------------------------------------------
-- 0) Drop old assignment constraints UPFRONT.
--    We re-point and collapse budget_types below; without dropping
--    `unique_active_assignment` first, pointing two duplicate rows'
--    assignments at the same survivor would violate it.
-- ----------------------------------------------------------------
ALTER TABLE IF EXISTS public.budget_type_template_assignments
  DROP CONSTRAINT IF EXISTS unique_active_assignment;
ALTER TABLE IF EXISTS public.budget_type_template_assignments
  DROP CONSTRAINT IF EXISTS budget_type_template_assignments_budget_type_id_fkey;

-- ----------------------------------------------------------------
-- 0.5) Drop ALL existing policies on the config tables first.
--    The old team-scoped policies reference columns we are about to
--    drop/change (e.g. budget_type_templates.team_id), and Postgres
--    refuses to drop a column a policy depends on. All policies are
--    recreated with the new org-global definitions in section 5.
-- ----------------------------------------------------------------
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('budget_types', 'budget_type_templates', 'budget_type_template_assignments')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
                   pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;


-- ----------------------------------------------------------------
-- 1) budget_types: make global, add stable `code`, seed built-ins
-- ----------------------------------------------------------------
ALTER TABLE IF EXISTS public.budget_types ALTER COLUMN team_id DROP NOT NULL;
ALTER TABLE IF EXISTS public.budget_types DROP CONSTRAINT IF EXISTS unique_team_budget_type_name;
ALTER TABLE IF EXISTS public.budget_types ADD COLUMN IF NOT EXISTS code TEXT;

-- Re-point existing template assignments from duplicate (same-name) budget_type
-- rows to the surviving row BEFORE collapsing, so no assignment is lost.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'budget_type_template_assignments'
      AND column_name = 'budget_type_id'
  ) THEN
    UPDATE public.budget_type_template_assignments a
    SET budget_type_id = keep.id
    FROM (
      SELECT DISTINCT ON (name) id, name
      FROM public.budget_types
      ORDER BY name, (is_deleted IS TRUE), id
    ) keep
    JOIN public.budget_types dup
      ON dup.name = keep.name AND dup.id <> keep.id
    WHERE a.budget_type_id = dup.id;
  END IF;
END $$;

-- Collapse legacy team-scoped rows into one org-global row per name
-- (keeps the first non-deleted row, otherwise the lowest id).
WITH keep AS (
  SELECT DISTINCT ON (name) id
  FROM public.budget_types
  ORDER BY name, (is_deleted IS TRUE), id
)
DELETE FROM public.budget_types a
USING public.budget_types b
WHERE b.id IN (SELECT id FROM keep)
  AND a.name = b.name
  AND a.id <> b.id;

-- Backfill the stable code for the built-in types from their display names
UPDATE public.budget_types bt
SET code = v.code
FROM (VALUES
  ('Monthly',      'monthly'),
  ('Medical',      'medical'),
  ('Travel',       'travel'),
  ('Passport & Visa', 'passport-visa'),
  ('Legal',        'legal'),
  ('DR',           'dr'),
  ('Adhoc',        'adhoc'),
  ('Emergency',    'emergency'),
  ('Shipping',     'shipping'),
  ('Unallocated',  'unallocated')
) AS v(name, code)
WHERE bt.name = v.name AND bt.code IS NULL;

-- Auto-generate codes for any OTHER active types you created that have no
-- code yet, so they work with templates too (e.g. "Projects & Initiatives"
-- → "projects-initiatives"). Collision-safe (appends -2, -3 … if needed).
DO $$
DECLARE
  r RECORD;
  base TEXT;
  candidate TEXT;
  n INT;
BEGIN
  FOR r IN
    SELECT id, name FROM public.budget_types
    WHERE code IS NULL AND is_deleted = FALSE
    ORDER BY id
  LOOP
    base := lower(regexp_replace(coalesce(r.name, 'type'), '[^a-zA-Z0-9]+', '-', 'g'));
    base := regexp_replace(base, '^-+|-+$', '', 'g');
    IF base = '' THEN base := 'type'; END IF;
    candidate := base;
    n := 2;
    WHILE EXISTS (
      SELECT 1 FROM public.budget_types WHERE code = candidate AND id <> r.id
    ) LOOP
      candidate := base || '-' || n::text;
      n := n + 1;
    END LOOP;
    UPDATE public.budget_types SET code = candidate WHERE id = r.id;
  END LOOP;
END $$;

-- Unallocated is system-managed: never shown in the creation dropdown
UPDATE public.budget_types SET is_active = FALSE WHERE code = 'unallocated';

-- One active type per code (soft-deleted rows can keep the code)
DROP INDEX IF EXISTS idx_budget_types_code;
CREATE UNIQUE INDEX idx_budget_types_code
  ON public.budget_types (code)
  WHERE NOT is_deleted AND code IS NOT NULL;

DROP INDEX IF EXISTS idx_budget_types_name;
CREATE UNIQUE INDEX idx_budget_types_name
  ON public.budget_types (name)
  WHERE NOT is_deleted;

-- Seed the standard org budget types (idempotent)
INSERT INTO public.budget_types (name, label, code, is_active)
SELECT v.name, v.label, v.code, v.is_active
FROM (VALUES
  ('Monthly',      'Monthly',         'monthly',       TRUE),
  ('Medical',      'Medical',         'medical',       TRUE),
  ('Travel',       'Travel',          'travel',        TRUE),
  ('Passport & Visa','Passport & Visa','passport-visa', TRUE),
  ('Legal',        'Legal',           'legal',         TRUE),
  ('DR',           'DR',              'dr',            TRUE),
  ('Adhoc',        'Adhoc',           'adhoc',         TRUE),
  ('Emergency',    'Emergency',       'emergency',     TRUE),
  ('Shipping',     'Shipping',        'shipping',      TRUE),
  ('Unallocated',  'Unallocated',     'unallocated',   FALSE) -- system-only, hidden from creation
) AS v(name, label, code, is_active)
WHERE NOT EXISTS (
  SELECT 1 FROM public.budget_types bt WHERE bt.code = v.code
);

-- ----------------------------------------------------------------
-- 2) budget_type_templates: make global (drop team_id)
-- ----------------------------------------------------------------
ALTER TABLE IF EXISTS public.budget_type_templates
  DROP CONSTRAINT IF EXISTS budget_type_templates_team_id_fkey;
ALTER TABLE IF EXISTS public.budget_type_templates DROP COLUMN IF EXISTS team_id;
ALTER TABLE IF EXISTS public.budget_type_templates
  DROP CONSTRAINT IF EXISTS unique_team_template_name;

-- Re-point assignments from duplicate (same-name) template rows before collapsing
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'budget_type_template_assignments'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'budget_type_templates'
  ) THEN
    UPDATE public.budget_type_template_assignments a
    SET template_id = keep.id
    FROM (
      SELECT DISTINCT ON (name) id, name
      FROM public.budget_type_templates
      ORDER BY name, (is_deleted IS TRUE), id
    ) keep
    JOIN public.budget_type_templates dup
      ON dup.name = keep.name AND dup.id <> keep.id
    WHERE a.template_id = dup.id;
  END IF;
END $$;

-- Collapse legacy team-scoped rows into one org-global row per name
-- (keeps the first non-deleted row, otherwise the lowest id).
WITH keep AS (
  SELECT DISTINCT ON (name) id
  FROM public.budget_type_templates
  ORDER BY name, (is_deleted IS TRUE), id
)
DELETE FROM public.budget_type_templates a
USING public.budget_type_templates b
WHERE b.id IN (SELECT id FROM keep)
  AND a.name = b.name
  AND a.id <> b.id;

DROP INDEX IF EXISTS idx_budget_type_templates_name;
CREATE UNIQUE INDEX idx_budget_type_templates_name
  ON public.budget_type_templates (name)
  WHERE NOT is_deleted;

-- ----------------------------------------------------------------
-- 3) budget_type_template_assignments: global, keyed by type code
-- ----------------------------------------------------------------
ALTER TABLE IF EXISTS public.budget_type_template_assignments
  DROP CONSTRAINT IF EXISTS budget_type_template_assignments_team_id_fkey;
ALTER TABLE IF EXISTS public.budget_type_template_assignments DROP COLUMN IF EXISTS team_id;

ALTER TABLE IF EXISTS public.budget_type_template_assignments
  DROP CONSTRAINT IF EXISTS unique_active_assignment;
ALTER TABLE IF EXISTS public.budget_type_template_assignments
  DROP CONSTRAINT IF EXISTS budget_type_template_assignments_budget_type_id_fkey;

ALTER TABLE IF EXISTS public.budget_type_template_assignments
  ADD COLUMN IF NOT EXISTS budget_type TEXT;

-- Backfill legacy assignments that referenced the old budget_type_id FK
-- (guarded in case a prior partial run already migrated the column)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'budget_type_template_assignments'
      AND column_name = 'budget_type_id'
  ) THEN
    UPDATE public.budget_type_template_assignments a
    SET budget_type = bt.code
    FROM public.budget_types bt
    WHERE a.budget_type_id = bt.id AND a.budget_type IS NULL;
  END IF;
END $$;

DELETE FROM public.budget_type_template_assignments a
USING public.budget_type_template_assignments b
WHERE a.budget_type = b.budget_type
  AND a.budget_type IS NOT NULL
  AND a.is_deleted = FALSE
  AND b.is_deleted = FALSE
  AND a.id > b.id;

ALTER TABLE IF EXISTS public.budget_type_template_assignments
  DROP COLUMN IF EXISTS budget_type_id;

DROP INDEX IF EXISTS idx_assignments_budget_type;
DROP INDEX IF EXISTS idx_assignments_active;
DROP INDEX IF EXISTS idx_assignments_team;

-- One active template per budget type
DROP INDEX IF EXISTS idx_assignments_active_budget_type;
CREATE UNIQUE INDEX idx_assignments_active_budget_type
  ON public.budget_type_template_assignments (budget_type)
  WHERE NOT is_deleted AND budget_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_assignments_budget_type
  ON public.budget_type_template_assignments (budget_type);
CREATE INDEX IF NOT EXISTS idx_assignments_template
  ON public.budget_type_template_assignments (template_id);

-- ----------------------------------------------------------------
-- 4) budget_plans: remove hard-coded type CHECK, add template_id
-- ----------------------------------------------------------------
ALTER TABLE public.budget_plans
  DROP CONSTRAINT IF EXISTS budget_plans_budget_type_check;

ALTER TABLE public.budget_plans
  ADD COLUMN IF NOT EXISTS template_id BIGINT
    REFERENCES public.budget_type_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_budget_plans_template_id
  ON public.budget_plans (template_id);

-- ----------------------------------------------------------------
-- 5) RLS: global config is readable by every authenticated user
--    (budget creation needs it); only admins / finance_setup write.
-- ----------------------------------------------------------------
-- Types
DROP POLICY IF EXISTS budget_types_read_policy ON public.budget_types;
CREATE POLICY budget_types_read_policy ON public.budget_types
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS budget_types_write_policy ON public.budget_types;
DROP POLICY IF EXISTS budget_types_update_policy ON public.budget_types;
DROP POLICY IF EXISTS budget_types_delete_policy ON public.budget_types;

CREATE POLICY budget_types_insert_policy ON public.budget_types
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','caoh','oh','ceo')
      OR auth.uid() IN (SELECT user_id FROM public.app_role_assignments WHERE app_code = 'finance_setup' AND is_deleted = FALSE)
    )
  );

CREATE POLICY budget_types_update_policy ON public.budget_types
  FOR UPDATE USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','caoh','oh','ceo')
    OR auth.uid() IN (SELECT user_id FROM public.app_role_assignments WHERE app_code = 'finance_setup' AND is_deleted = FALSE)
  );

CREATE POLICY budget_types_delete_policy ON public.budget_types
  FOR DELETE USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','caoh','oh','ceo')
    OR auth.uid() IN (SELECT user_id FROM public.app_role_assignments WHERE app_code = 'finance_setup' AND is_deleted = FALSE)
  );

-- Templates
DROP POLICY IF EXISTS budget_templates_read_policy ON public.budget_type_templates;
CREATE POLICY budget_templates_read_policy ON public.budget_type_templates
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS budget_templates_write_policy ON public.budget_type_templates;
DROP POLICY IF EXISTS budget_templates_update_policy ON public.budget_type_templates;
DROP POLICY IF EXISTS budget_templates_delete_policy ON public.budget_type_templates;

CREATE POLICY budget_templates_insert_policy ON public.budget_type_templates
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','caoh','oh','ceo')
      OR auth.uid() IN (SELECT user_id FROM public.app_role_assignments WHERE app_code = 'finance_setup' AND is_deleted = FALSE)
    )
  );

CREATE POLICY budget_templates_update_policy ON public.budget_type_templates
  FOR UPDATE USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','caoh','oh','ceo')
    OR auth.uid() IN (SELECT user_id FROM public.app_role_assignments WHERE app_code = 'finance_setup' AND is_deleted = FALSE)
  );

CREATE POLICY budget_templates_delete_policy ON public.budget_type_templates
  FOR DELETE USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','caoh','oh','ceo')
    OR auth.uid() IN (SELECT user_id FROM public.app_role_assignments WHERE app_code = 'finance_setup' AND is_deleted = FALSE)
  );

-- Assignments
DROP POLICY IF EXISTS assignments_read_policy ON public.budget_type_template_assignments;
CREATE POLICY assignments_read_policy ON public.budget_type_template_assignments
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS assignments_write_policy ON public.budget_type_template_assignments;
DROP POLICY IF EXISTS assignments_update_policy ON public.budget_type_template_assignments;
DROP POLICY IF EXISTS assignments_delete_policy ON public.budget_type_template_assignments;

CREATE POLICY assignments_insert_policy ON public.budget_type_template_assignments
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','caoh','oh','ceo')
      OR auth.uid() IN (SELECT user_id FROM public.app_role_assignments WHERE app_code = 'finance_setup' AND is_deleted = FALSE)
    )
  );

CREATE POLICY assignments_update_policy ON public.budget_type_template_assignments
  FOR UPDATE USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','caoh','oh','ceo')
    OR auth.uid() IN (SELECT user_id FROM public.app_role_assignments WHERE app_code = 'finance_setup' AND is_deleted = FALSE)
  );

CREATE POLICY assignments_delete_policy ON public.budget_type_template_assignments
  FOR DELETE USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin','caoh','oh','ceo')
    OR auth.uid() IN (SELECT user_id FROM public.app_role_assignments WHERE app_code = 'finance_setup' AND is_deleted = FALSE)
  );