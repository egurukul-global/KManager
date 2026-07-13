-- Diagnose why Auth createUser returns 500.
-- Run in Supabase → SQL Editor and send back the results if needed.

-- 1) Role check currently on users
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conname = 'users_role_check';

-- 2) Triggers on auth.users (common cause of Auth 500)
SELECT tgname AS trigger_name,
       pg_get_triggerdef(oid) AS definition
FROM pg_trigger
WHERE tgrelid = 'auth.users'::regclass
  AND NOT tgisinternal;

-- 3) Functions often used by those triggers
SELECT p.proname AS function_name,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public', 'auth')
  AND p.proname ILIKE '%user%'
  AND pg_get_functiondef(p.oid) ILIKE '%users%';
