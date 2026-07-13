-- Fix users.role so ordinary "user" accounts can be created/saved.
-- Run in Supabase → SQL Editor (all at once).

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

UPDATE users SET role = 'admin' WHERE lower(trim(coalesce(role, ''))) IN ('admin', 'sys', 'system', 'system admin');
UPDATE users SET role = 'caoh'  WHERE lower(trim(coalesce(role, ''))) IN ('caoh', 'cao', 'chief admin');
UPDATE users SET role = 'oh'    WHERE lower(trim(coalesce(role, ''))) IN ('oh', 'fih', 'finance head', 'ohf');
UPDATE users SET role = 'ceo'   WHERE lower(trim(coalesce(role, ''))) IN ('ceo');
UPDATE users SET role = 'user'  WHERE lower(trim(coalesce(role, ''))) IN ('user', 'member', 'ops', 'otm', 'view', 'viewer', '');

UPDATE users
SET role = 'user'
WHERE role IS NULL
   OR lower(trim(role)) NOT IN ('user', 'oh', 'caoh', 'ceo', 'admin');

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('user', 'oh', 'caoh', 'ceo', 'admin'));
