-- 073_user_default_view.sql
-- Adds default_login_view to the users table to support the new Context-Based Architecture.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS default_login_view TEXT NOT NULL DEFAULT 'team'
  CHECK (default_login_view IN ('team', 'manager', 'admin'));
