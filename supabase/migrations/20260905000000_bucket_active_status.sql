-- Migration: Add active status to buckets and enforce non-negative balance

-- 1. Add is_active column
ALTER TABLE buckets 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- 2. Fix any existing negative balances before applying constraint
UPDATE buckets 
SET balance = 0 
WHERE balance < 0;

-- 3. Add CHECK constraint for balance
ALTER TABLE buckets 
ADD CONSTRAINT chk_bucket_balance_non_negative 
CHECK (balance >= 0);