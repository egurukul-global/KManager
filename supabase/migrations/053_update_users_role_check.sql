-- Migration 053: Update users_role_check constraint to include 'fin' and 'fip' org roles

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('user', 'oh', 'caoh', 'ceo', 'admin', 'fin', 'fip'));
