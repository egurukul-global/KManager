-- Phase 4C Lite: user on-hold + org-admin user profile management

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS on_hold BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN users.on_hold IS
  'When true, user cannot use the app (v1 hold). Set by org admin.';

CREATE INDEX IF NOT EXISTS idx_users_on_hold ON users (on_hold) WHERE on_hold = true;

-- Org admins may insert/update app user profiles (auth user created via Edge Function).
DROP POLICY IF EXISTS users_org_admin_insert ON users;
CREATE POLICY users_org_admin_insert ON users
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin());

DROP POLICY IF EXISTS users_org_admin_update ON users;
CREATE POLICY users_org_admin_update ON users
  FOR UPDATE TO authenticated
  USING (public.is_org_admin())
  WITH CHECK (public.is_org_admin());
