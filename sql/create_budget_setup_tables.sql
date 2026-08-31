-- ==================== BUDGET SETUP TABLES ====================
-- Created for Finance Setup menu restructure (Categories, Budget Types, Templates)
-- Run this on Supabase to create tables for budget type management

-- ==================== 1. BUDGET TYPES TABLE ====================
-- Defines budget types (Monthly, Medical, Travel, etc.)
CREATE TABLE IF NOT EXISTS public.budget_types (
  id BIGSERIAL PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
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
  is_deleted BOOLEAN DEFAULT FALSE,
  
  CONSTRAINT unique_team_budget_type_name UNIQUE(team_id, name, is_deleted)
);

CREATE INDEX IF NOT EXISTS idx_budget_types_team ON public.budget_types(team_id);
CREATE INDEX IF NOT EXISTS idx_budget_types_active ON public.budget_types(team_id, is_active) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_budget_types_deleted ON public.budget_types(is_deleted);

-- ==================== 2. BUDGET TYPE TEMPLATES TABLE ====================
-- Defines budget templates (which categories are included in a template)
CREATE TABLE IF NOT EXISTS public.budget_type_templates (
  id BIGSERIAL PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  
  -- template_data: JSON array of category IDs
  -- Example: [1, 2, 3, 5] means main categories 1,2,3 and subcategory 5
  template_data JSONB DEFAULT '[]'::jsonb,
  
  -- Audit fields
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMP WITH TIME ZONE,
  is_deleted BOOLEAN DEFAULT FALSE,
  
  CONSTRAINT unique_team_template_name UNIQUE(team_id, name, is_deleted)
);

CREATE INDEX IF NOT EXISTS idx_budget_type_templates_team ON public.budget_type_templates(team_id);
CREATE INDEX IF NOT EXISTS idx_budget_type_templates_deleted ON public.budget_type_templates(is_deleted);

-- ==================== 3. BUDGET TYPE TEMPLATE ASSIGNMENTS TABLE ====================
-- Links templates to budget types (which template to use for which budget type)
CREATE TABLE IF NOT EXISTS public.budget_type_template_assignments (
  id BIGSERIAL PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  budget_type_id BIGINT NOT NULL REFERENCES public.budget_types(id) ON DELETE CASCADE,
  template_id BIGINT NOT NULL REFERENCES public.budget_type_templates(id) ON DELETE CASCADE,
  
  -- Audit fields
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT FALSE,
  
  CONSTRAINT unique_active_assignment UNIQUE(budget_type_id, is_deleted) 
    -- Only one active assignment per budget type
);

CREATE INDEX IF NOT EXISTS idx_assignments_team ON public.budget_type_template_assignments(team_id);
CREATE INDEX IF NOT EXISTS idx_assignments_budget_type ON public.budget_type_template_assignments(budget_type_id);
CREATE INDEX IF NOT EXISTS idx_assignments_template ON public.budget_type_template_assignments(template_id);
CREATE INDEX IF NOT EXISTS idx_assignments_active ON public.budget_type_template_assignments(budget_type_id, is_deleted) WHERE NOT is_deleted;

-- ==================== ROW LEVEL SECURITY (RLS) ====================

-- Enable RLS on all three tables
ALTER TABLE public.budget_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_type_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_type_template_assignments ENABLE ROW LEVEL SECURITY;

-- ==================== BUDGET TYPES RLS POLICIES ====================

-- Policy: Team members can read; org admins can read across all teams
DROP POLICY IF EXISTS budget_types_read_policy ON public.budget_types;
CREATE POLICY budget_types_read_policy ON public.budget_types
  FOR SELECT
  USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'caoh', 'oh', 'ceo')
    OR team_id IN (
      SELECT team_id FROM public.user_teams 
      WHERE user_id = auth.uid() AND is_deleted = FALSE
    )
  );

-- Policy: Org admins and finance_setup users can create/update/delete
DROP POLICY IF EXISTS budget_types_write_policy ON public.budget_types;
CREATE POLICY budget_types_write_policy ON public.budget_types
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      -- Org admins can manage budget types for any team
      (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'caoh', 'oh', 'ceo')
      OR (
        -- Others must be a member of the team AND have finance_setup app role
        team_id IN (
          SELECT team_id FROM public.user_teams 
          WHERE user_id = auth.uid() AND is_deleted = FALSE
        )
        AND auth.uid() IN (
          SELECT user_id FROM public.app_role_assignments
          WHERE app_code = 'finance_setup' AND is_deleted = FALSE
        )
      )
    )
  );

DROP POLICY IF EXISTS budget_types_update_policy ON public.budget_types;
CREATE POLICY budget_types_update_policy ON public.budget_types
  FOR UPDATE
  USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'caoh', 'oh', 'ceo')
    OR (
      team_id IN (
        SELECT team_id FROM public.user_teams 
        WHERE user_id = auth.uid() AND is_deleted = FALSE
      )
      AND auth.uid() IN (
        SELECT user_id FROM public.app_role_assignments
        WHERE app_code = 'finance_setup' AND is_deleted = FALSE
      )
    )
  );

DROP POLICY IF EXISTS budget_types_delete_policy ON public.budget_types;
CREATE POLICY budget_types_delete_policy ON public.budget_types
  FOR DELETE
  USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'caoh', 'oh', 'ceo')
    OR (
      team_id IN (
        SELECT team_id FROM public.user_teams 
        WHERE user_id = auth.uid() AND is_deleted = FALSE
      )
      AND auth.uid() IN (
        SELECT user_id FROM public.app_role_assignments
        WHERE app_code = 'finance_setup' AND is_deleted = FALSE
      )
    )
  );

-- ==================== BUDGET TYPE TEMPLATES RLS POLICIES ====================

-- Policy: Team members can read; org admins can read across all teams
DROP POLICY IF EXISTS budget_templates_read_policy ON public.budget_type_templates;
CREATE POLICY budget_templates_read_policy ON public.budget_type_templates
  FOR SELECT
  USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'caoh', 'oh', 'ceo')
    OR team_id IN (
      SELECT team_id FROM public.user_teams 
      WHERE user_id = auth.uid() AND is_deleted = FALSE
    )
  );

-- Policy: Org admins and finance_setup users can create/update/delete templates
DROP POLICY IF EXISTS budget_templates_write_policy ON public.budget_type_templates;
CREATE POLICY budget_templates_write_policy ON public.budget_type_templates
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'caoh', 'oh', 'ceo')
      OR (
        team_id IN (
          SELECT team_id FROM public.user_teams 
          WHERE user_id = auth.uid() AND is_deleted = FALSE
        )
        AND auth.uid() IN (
          SELECT user_id FROM public.app_role_assignments
          WHERE app_code = 'finance_setup' AND is_deleted = FALSE
        )
      )
    )
  );

DROP POLICY IF EXISTS budget_templates_update_policy ON public.budget_type_templates;
CREATE POLICY budget_templates_update_policy ON public.budget_type_templates
  FOR UPDATE
  USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'caoh', 'oh', 'ceo')
    OR (
      team_id IN (
        SELECT team_id FROM public.user_teams 
        WHERE user_id = auth.uid() AND is_deleted = FALSE
      )
      AND auth.uid() IN (
        SELECT user_id FROM public.app_role_assignments
        WHERE app_code = 'finance_setup' AND is_deleted = FALSE
      )
    )
  );

DROP POLICY IF EXISTS budget_templates_delete_policy ON public.budget_type_templates;
CREATE POLICY budget_templates_delete_policy ON public.budget_type_templates
  FOR DELETE
  USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'caoh', 'oh', 'ceo')
    OR (
      team_id IN (
        SELECT team_id FROM public.user_teams 
        WHERE user_id = auth.uid() AND is_deleted = FALSE
      )
      AND auth.uid() IN (
        SELECT user_id FROM public.app_role_assignments
        WHERE app_code = 'finance_setup' AND is_deleted = FALSE
      )
    )
  );

-- ==================== BUDGET TYPE TEMPLATE ASSIGNMENTS RLS POLICIES ====================

-- Policy: Team members can read; org admins can read across all teams
DROP POLICY IF EXISTS assignments_read_policy ON public.budget_type_template_assignments;
CREATE POLICY assignments_read_policy ON public.budget_type_template_assignments
  FOR SELECT
  USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'caoh', 'oh', 'ceo')
    OR team_id IN (
      SELECT team_id FROM public.user_teams 
      WHERE user_id = auth.uid() AND is_deleted = FALSE
    )
  );

-- Policy: Org admins and finance_setup users can create/update/delete assignments
DROP POLICY IF EXISTS assignments_write_policy ON public.budget_type_template_assignments;
CREATE POLICY assignments_write_policy ON public.budget_type_template_assignments
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'caoh', 'oh', 'ceo')
      OR (
        team_id IN (
          SELECT team_id FROM public.user_teams 
          WHERE user_id = auth.uid() AND is_deleted = FALSE
        )
        AND auth.uid() IN (
          SELECT user_id FROM public.app_role_assignments
          WHERE app_code = 'finance_setup' AND is_deleted = FALSE
        )
      )
    )
  );

DROP POLICY IF EXISTS assignments_update_policy ON public.budget_type_template_assignments;
CREATE POLICY assignments_update_policy ON public.budget_type_template_assignments
  FOR UPDATE
  USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'caoh', 'oh', 'ceo')
    OR (
      team_id IN (
        SELECT team_id FROM public.user_teams 
        WHERE user_id = auth.uid() AND is_deleted = FALSE
      )
      AND auth.uid() IN (
        SELECT user_id FROM public.app_role_assignments
        WHERE app_code = 'finance_setup' AND is_deleted = FALSE
      )
    )
  );

DROP POLICY IF EXISTS assignments_delete_policy ON public.budget_type_template_assignments;
CREATE POLICY assignments_delete_policy ON public.budget_type_template_assignments
  FOR DELETE
  USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'caoh', 'oh', 'ceo')
    OR (
      team_id IN (
        SELECT team_id FROM public.user_teams 
        WHERE user_id = auth.uid() AND is_deleted = FALSE
      )
      AND auth.uid() IN (
        SELECT user_id FROM public.app_role_assignments
        WHERE app_code = 'finance_setup' AND is_deleted = FALSE
      )
    )
  );

-- ==================== COMMENTS ====================

COMMENT ON TABLE public.budget_types IS 'Budget type definitions (Monthly, Medical, Travel, etc.) - Finance Setup configuration';
COMMENT ON TABLE public.budget_type_templates IS 'Templates defining which categories are available for budgets - Finance Setup configuration';
COMMENT ON TABLE public.budget_type_template_assignments IS 'Links templates to budget types to auto-populate categories when creating new budgets';

COMMENT ON COLUMN public.budget_types.is_active IS 'Soft delete: FALSE means deleted but kept for historical reference';
COMMENT ON COLUMN public.budget_type_templates.template_data IS 'JSON array of category IDs included in this template';
COMMENT ON COLUMN public.budget_type_template_assignments.is_deleted IS 'Soft delete: allows reassigning template to another budget type';
