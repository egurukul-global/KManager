-- ================================================================
-- BUDGET SETUP TABLES — CANONICAL (org-global) SCHEMA
-- ----------------------------------------------------------------
-- Budgets themselves remain team-scoped (budget_plans.team_id).
-- Budget types → org-global definitions with a stable text `code`.
-- Templates    → org-global definitions (no team_id).
-- Assignments  → org-global, one active template per type code.
-- budget_plans.template_id  → nullable, ON DELETE SET NULL.
-- No hard-coded CHECK on budget_plans.budget_type (dropped).
--
-- If tables already exist, run the migration:
--   supabase/migrations/20260831000000_global_budget_types_templates.sql
-- ================================================================

-- ==================== 1. BUDGET TYPES (ORG-GLOBAL) ====================
CREATE TABLE IF NOT EXISTS public.budget_types (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE,
  name VARCHAR(100) NOT NULL,
  label VARCHAR(150) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,

  -- Audit fields
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMP WITH TIME ZONE,
  is_deleted BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_budget_types_active ON public.budget_types(is_active) WHERE NOT is_deleted;

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

-- ==================== 2. BUDGET TYPE TEMPLATES (ORG-GLOBAL) ====================
-- template_data: JSON array like [{"category":"Medical","subcategory":null,"is_mandatory":true}]
CREATE TABLE IF NOT EXISTS public.budget_type_templates (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL UNIQUE,
  description TEXT,
  template_data JSONB DEFAULT '[]'::jsonb,

  -- Audit fields
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMP WITH TIME ZONE,
  is_deleted BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_budget_type_templates_deleted ON public.budget_type_templates(is_deleted);

-- ==================== 3. BUDGET TYPE TEMPLATE ASSIGNMENTS (ORG-GLOBAL) ====================
-- Links one active template to each budget type code.
CREATE TABLE IF NOT EXISTS public.budget_type_template_assignments (
  id BIGSERIAL PRIMARY KEY,
  budget_type TEXT NOT NULL, -- references budget_types.code / budget_plans.budget_type
  template_id BIGINT NOT NULL REFERENCES public.budget_type_templates(id) ON DELETE CASCADE,

  -- Audit fields
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT FALSE
);

-- One active template per budget type
DROP INDEX IF EXISTS idx_assignments_active_budget_type;
CREATE UNIQUE INDEX idx_assignments_active_budget_type
  ON public.budget_type_template_assignments (budget_type)
  WHERE NOT is_deleted AND budget_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_assignments_budget_type ON public.budget_type_template_assignments(budget_type);
CREATE INDEX IF NOT EXISTS idx_assignments_template ON public.budget_type_template_assignments(template_id);

-- ==================== 4. BUDGET PLANS ADDITIONS ====================
ALTER TABLE public.budget_plans
  DROP CONSTRAINT IF EXISTS budget_plans_budget_type_check;

ALTER TABLE public.budget_plans
  ADD COLUMN IF NOT EXISTS template_id BIGINT
    REFERENCES public.budget_type_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_budget_plans_template_id ON public.budget_plans(template_id);

-- ==================== 5. ROW LEVEL SECURITY ====================
ALTER TABLE public.budget_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_type_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_type_template_assignments ENABLE ROW LEVEL SECURITY;

-- Global config is readable by every authenticated user (budget creation needs it);
-- only org admins / finance_setup role can write.
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

-- ==================== COMMENTS ====================
COMMENT ON TABLE public.budget_types IS 'Org-global budget type definitions with a stable text `code` used on budget_plans.';
COMMENT ON TABLE public.budget_type_templates IS 'Org-global templates defining which categories are available for budgets.';
COMMENT ON TABLE public.budget_type_template_assignments IS 'Org-global link of one active template per budget type code.';
COMMENT ON COLUMN public.budget_types.code IS 'Stable code stored on budget_plans.budget_type (e.g. medical, travel).';
COMMENT ON COLUMN public.budget_type_templates.template_data IS 'JSON array of {category, subcategory, is_mandatory} entries.';
COMMENT ON COLUMN public.budget_type_template_assignments.is_deleted IS 'Soft delete: allows reassigning a template to another budget type.';