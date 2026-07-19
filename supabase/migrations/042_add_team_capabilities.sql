-- Migration 042: Add capability flags to public.teams and user columns to public.users

ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS has_budget_access BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS has_tasks_access BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS has_lms_access BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS escalation_tokens INTEGER NOT NULL DEFAULT 3 CHECK (escalation_tokens BETWEEN 0 AND 3);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS gender TEXT NOT NULL DEFAULT 'male' CHECK (gender IN ('male', 'female'));
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS clearance_level TEXT NOT NULL DEFAULT 'standard' CHECK (clearance_level IN ('restricted', 'standard', 'supervisor'));
