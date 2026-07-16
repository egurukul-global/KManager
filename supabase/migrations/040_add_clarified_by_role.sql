-- Add clarified_by_role column to track which role requested clarification
ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS clarified_by_role TEXT;
