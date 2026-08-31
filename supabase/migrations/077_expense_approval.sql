-- 077_expense_approval.sql
-- Adds the formal finance review workflow for expenses

ALTER TABLE public.expenses 
ADD COLUMN IF NOT EXISTS is_submitted BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS is_reviewed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS review_notes TEXT,
ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE;

-- Update existing expenses so they don't break
-- We assume all past expenses before this feature were already "reviewed" or at least submitted to prevent locking up historical data.
UPDATE public.expenses 
SET is_submitted = true, is_reviewed = true 
WHERE is_reviewed IS NULL;

-- Refresh the schema cache if needed
NOTIFY pgrst, 'reload schema';
