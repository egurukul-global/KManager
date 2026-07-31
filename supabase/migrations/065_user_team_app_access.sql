-- Migration 065: Refactor ok_app_access and ok_menu_access to tie permissions to (user_id, team_id)

-- Create temporary tables to store current data
CREATE TEMP TABLE temp_app_access AS SELECT * FROM public.ok_app_access;
CREATE TEMP TABLE temp_menu_access AS SELECT * FROM public.ok_menu_access;

-- Drop old tables
DROP TABLE IF EXISTS public.ok_menu_access CASCADE;
DROP TABLE IF EXISTS public.ok_app_access CASCADE;

-- Re-create ok_app_access with team_id
CREATE TABLE public.ok_app_access (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  app_code text NOT NULL CHECK (app_code IN ('finance', 'gurukul', 'utilities', 'tasks', 'konnect')),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, team_id, app_code)
);

-- Re-create ok_menu_access with team_id
CREATE TABLE public.ok_menu_access (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  app_code text NOT NULL CHECK (app_code IN ('finance', 'gurukul', 'utilities', 'tasks', 'konnect')),
  menu_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, team_id, app_code, menu_key)
);

-- Restore data by duplicating permissions to all teams the user belongs to
INSERT INTO public.ok_app_access (user_id, team_id, app_code, enabled, created_at)
SELECT t.user_id, ut.team_id, t.app_code, t.enabled, t.created_at
FROM temp_app_access t
JOIN public.user_teams ut ON ut.user_id = t.user_id
ON CONFLICT DO NOTHING;

INSERT INTO public.ok_menu_access (user_id, team_id, app_code, menu_key, enabled, created_at)
SELECT t.user_id, ut.team_id, t.app_code, t.menu_key, t.enabled, t.created_at
FROM temp_menu_access t
JOIN public.user_teams ut ON ut.user_id = t.user_id
ON CONFLICT DO NOTHING;

-- Enable Row Level Security
ALTER TABLE public.ok_app_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ok_menu_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all read to authenticated" ON public.ok_app_access
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow all write to ok admins" ON public.ok_app_access
  FOR ALL TO authenticated USING (public.is_ok_admin());

CREATE POLICY "Allow all read to authenticated" ON public.ok_menu_access
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow all write to ok admins" ON public.ok_menu_access
  FOR ALL TO authenticated USING (public.is_ok_admin());
