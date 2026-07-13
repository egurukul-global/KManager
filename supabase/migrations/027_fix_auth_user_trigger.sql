-- Fix Auth createUser 500 (usually a trigger + users.role check problem).
-- Run ALL of this in Supabase → SQL Editor.

-- A) Allow normal org roles including "user"
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

-- B) Make sure on_hold exists
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS on_hold BOOLEAN NOT NULL DEFAULT false;

-- C) Replace the common auth→users trigger with a safe version
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, name, role, on_hold)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(COALESCE(NEW.email, 'user'), '@', 1)),
    'user',
    false
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    name = COALESCE(NULLIF(EXCLUDED.name, ''), public.users.name);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block auth user creation; log and continue
  RAISE WARNING 'handle_new_user failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created_trigger ON auth.users;
DROP TRIGGER IF EXISTS handle_new_user ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user();
