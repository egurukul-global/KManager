-- 1. Create Generic App Roles Table
CREATE TABLE IF NOT EXISTS public.app_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    app_code TEXT NOT NULL,
    role_code TEXT NOT NULL,
    role_name TEXT NOT NULL,
    can_be_global BOOLEAN DEFAULT false,
    can_be_team BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(app_code, role_code)
);

CREATE INDEX IF NOT EXISTS idx_app_roles_app_code ON public.app_roles(app_code);

-- 2. Create App Role Assignments Table
CREATE TABLE IF NOT EXISTS public.app_role_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    app_code TEXT NOT NULL,
    role_code TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES public.users(id),
    FOREIGN KEY (app_code, role_code) REFERENCES public.app_roles(app_code, role_code) ON DELETE CASCADE
);

-- Unique index to handle NULLs properly in team_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_global_role_assignment 
    ON public.app_role_assignments(app_code, role_code, user_id) 
    WHERE team_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_team_role_assignment 
    ON public.app_role_assignments(app_code, role_code, user_id, team_id) 
    WHERE team_id IS NOT NULL;

-- Indexes for foreign keys to ensure performance
CREATE INDEX IF NOT EXISTS idx_app_role_assignments_user_id ON public.app_role_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_app_role_assignments_team_id ON public.app_role_assignments(team_id);
CREATE INDEX IF NOT EXISTS idx_app_role_assignments_roles ON public.app_role_assignments(app_code, role_code);

-- 3. Upgrade bucket_access with granular permissions
ALTER TABLE public.bucket_access
ADD COLUMN IF NOT EXISTS can_transfer BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS can_view_balance BOOLEAN DEFAULT false;

-- 4. Initial Seed Data for Finance Roles
INSERT INTO public.app_roles (app_code, role_code, role_name, can_be_global, can_be_team)
VALUES 
    ('finance', 'fih', 'Finance Head', true, false),
    ('finance', 'fin', 'Finance Manager', true, true),
    ('finance', 'fip', 'Finance Payer', true, true)
ON CONFLICT (app_code, role_code) DO NOTHING;

-- 5. Row Level Security Policies
ALTER TABLE public.app_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_role_assignments ENABLE ROW LEVEL SECURITY;

-- App Roles: Read-only for authenticated users
CREATE POLICY "Allow read access to app_roles for all authenticated users"
    ON public.app_roles FOR SELECT
    TO authenticated
    USING (true);

-- App Role Assignments: Restrictive read policy
CREATE POLICY "Users can view their own role assignments"
    ON public.app_role_assignments FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());
