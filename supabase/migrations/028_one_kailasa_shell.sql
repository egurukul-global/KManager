-- Phase 4D: One Kailasa shell — platform admins, app/menu access, home pins, messages

-- ── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ok_admins (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ok_app_access (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  app_code text NOT NULL CHECK (app_code IN ('finance', 'gurukul', 'utilities')),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, app_code)
);

CREATE TABLE IF NOT EXISTS public.ok_menu_access (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  app_code text NOT NULL CHECK (app_code IN ('finance', 'gurukul', 'utilities')),
  menu_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, app_code, menu_key)
);

CREATE TABLE IF NOT EXISTS public.ok_home_pins (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  app_code text NOT NULL CHECK (app_code IN ('finance', 'gurukul', 'utilities')),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, app_code)
);

CREATE TABLE IF NOT EXISTS public.ok_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  team_id uuid NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  read_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ok_messages_user_created
  ON public.ok_messages (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ok_app_access_user
  ON public.ok_app_access (user_id) WHERE enabled = true;

-- Recreate helper now that ok_admins exists (first stub may have failed if table missing)
CREATE OR REPLACE FUNCTION public.is_ok_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ok_admins a
    WHERE a.user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_ok_admin() TO authenticated;

-- ── Seed Finance access for everyone already in users ────────────────────────

INSERT INTO public.ok_app_access (user_id, app_code, enabled)
SELECT u.id, 'finance', true
FROM public.users u
ON CONFLICT (user_id, app_code) DO NOTHING;

-- Core Finance menus (aligned with current nav page ids)
INSERT INTO public.ok_menu_access (user_id, app_code, menu_key, enabled)
SELECT u.id, 'finance', m.menu_key, true
FROM public.users u
CROSS JOIN (VALUES
  ('dashboard'),
  ('profile'),
  ('approval-portal'),
  ('buckets'),
  ('categories'),
  ('rates'),
  ('create-budget'),
  ('view-budgets'),
  ('add-funds'),
  ('income-manager'),
  ('transfer'),
  ('my-income'),
  ('add-expense'),
  ('expense-manager'),
  ('generate-receipt'),
  ('financial-status'),
  ('reconcile'),
  ('reconciliation-overview'),
  ('reconciliation-approval'),
  ('expense-reports'),
  ('my-finances'),
  ('team-mgmt'),
  ('role-assignments'),
  ('user-mgmt'),
  ('budget-calendar'),
  ('category-master')
) AS m(menu_key)
ON CONFLICT (user_id, app_code, menu_key) DO NOTHING;

-- Default home pin: Finance
INSERT INTO public.ok_home_pins (user_id, app_code, sort_order)
SELECT u.id, 'finance', 0
FROM public.users u
ON CONFLICT (user_id, app_code) DO NOTHING;

-- Platform admin seed
INSERT INTO public.ok_admins (user_id)
SELECT u.id FROM public.users u
WHERE lower(trim(u.email)) = 'rishi.advait.one@gmail.com'
ON CONFLICT (user_id) DO NOTHING;

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.ok_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ok_app_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ok_menu_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ok_home_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ok_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ok_admins_select ON public.ok_admins;
CREATE POLICY ok_admins_select ON public.ok_admins
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_ok_admin());

DROP POLICY IF EXISTS ok_admins_manage ON public.ok_admins;
CREATE POLICY ok_admins_manage ON public.ok_admins
  FOR ALL TO authenticated
  USING (public.is_ok_admin())
  WITH CHECK (public.is_ok_admin());

DROP POLICY IF EXISTS ok_app_access_select ON public.ok_app_access;
CREATE POLICY ok_app_access_select ON public.ok_app_access
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_ok_admin());

DROP POLICY IF EXISTS ok_app_access_manage ON public.ok_app_access;
CREATE POLICY ok_app_access_manage ON public.ok_app_access
  FOR ALL TO authenticated
  USING (public.is_ok_admin())
  WITH CHECK (public.is_ok_admin());

DROP POLICY IF EXISTS ok_menu_access_select ON public.ok_menu_access;
CREATE POLICY ok_menu_access_select ON public.ok_menu_access
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_ok_admin());

DROP POLICY IF EXISTS ok_menu_access_manage ON public.ok_menu_access;
CREATE POLICY ok_menu_access_manage ON public.ok_menu_access
  FOR ALL TO authenticated
  USING (public.is_ok_admin())
  WITH CHECK (public.is_ok_admin());

DROP POLICY IF EXISTS ok_home_pins_select ON public.ok_home_pins;
CREATE POLICY ok_home_pins_select ON public.ok_home_pins
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_ok_admin());

DROP POLICY IF EXISTS ok_home_pins_own ON public.ok_home_pins;
CREATE POLICY ok_home_pins_own ON public.ok_home_pins
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS ok_messages_select ON public.ok_messages;
CREATE POLICY ok_messages_select ON public.ok_messages
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_ok_admin());

DROP POLICY IF EXISTS ok_messages_update_own ON public.ok_messages;
CREATE POLICY ok_messages_update_own ON public.ok_messages
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS ok_messages_insert_admin ON public.ok_messages;
CREATE POLICY ok_messages_insert_admin ON public.ok_messages
  FOR INSERT TO authenticated
  WITH CHECK (public.is_ok_admin() OR user_id = auth.uid());

DROP POLICY IF EXISTS ok_messages_delete_admin ON public.ok_messages;
CREATE POLICY ok_messages_delete_admin ON public.ok_messages
  FOR DELETE TO authenticated
  USING (public.is_ok_admin());

COMMENT ON TABLE public.ok_admins IS 'One Kailasa platform admins (not Finance department).';
COMMENT ON TABLE public.ok_app_access IS 'Per-user which apps they may open.';
COMMENT ON TABLE public.ok_menu_access IS 'Per-user menu keys within an app.';
COMMENT ON TABLE public.ok_home_pins IS 'Which app logos show on One Kailasa home.';
COMMENT ON TABLE public.ok_messages IS 'Simple inbox messages for home notifications.';

-- OK Admins may update user hold / basic profile fields (platform people mgmt)
DROP POLICY IF EXISTS users_ok_admin_update ON users;
CREATE POLICY users_ok_admin_update ON users
  FOR UPDATE TO authenticated
  USING (public.is_ok_admin())
  WITH CHECK (public.is_ok_admin());

DROP POLICY IF EXISTS users_ok_admin_select ON users;
CREATE POLICY users_ok_admin_select ON users
  FOR SELECT TO authenticated
  USING (public.is_ok_admin() OR id = auth.uid());
