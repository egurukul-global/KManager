-- 074_user_allowed_views.sql
-- Adds allowed_views to the users table to dynamically assign view access.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS allowed_views TEXT[] DEFAULT '{team}';

-- Default migrations
-- Give admins all views
UPDATE public.users SET allowed_views = '{team,manager,admin}'
WHERE role IN ('admin', 'caoh', 'oh', 'ceo');

-- Give finance roles manager view
UPDATE public.users SET allowed_views = '{team,manager}'
WHERE role IN ('fin', 'fip');

-- Everyone else just gets {team} (which is the default)
