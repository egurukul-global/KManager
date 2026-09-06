-- 078_expense_categories.sql
-- Upgrade expenses to use category_id and subcategory_id from category_master/subcategory_master
-- Run in Supabase SQL editor.

-- ============================================================
-- Step 1: Drop existing FK constraints
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'expenses_category_id_fkey' 
    AND table_name = 'expenses'
  ) THEN
    ALTER TABLE expenses DROP CONSTRAINT expenses_category_id_fkey;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'expenses_subcategory_id_fkey' 
    AND table_name = 'expenses'
  ) THEN
    ALTER TABLE expenses DROP CONSTRAINT expenses_subcategory_id_fkey;
  END IF;
END $$;

-- ============================================================
-- Step 2: Add columns (if not already present)
-- ============================================================
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS category_id UUID,
  ADD COLUMN IF NOT EXISTS subcategory_id UUID;

-- ============================================================
-- Step 3: Clear any invalid category_id values (from old categories table)
-- ============================================================
UPDATE expenses SET category_id = NULL WHERE category_id NOT IN (SELECT id FROM category_master);
UPDATE expenses SET subcategory_id = NULL WHERE subcategory_id NOT IN (SELECT id FROM subcategory_master);

-- ============================================================
-- Step 4: Back-fill from budget categories (Dubai July 2026 example)
-- Mapping:
--   Accommodation → Rent
--   Food → Food
--   Travel → Transport
--   Data → Internet Phone
-- ============================================================

-- Accommodation → Rent
UPDATE expenses e
SET category_id = (SELECT id FROM category_master WHERE name ILIKE 'Rent' LIMIT 1)
FROM budget_plans bp
WHERE e.budget_id = bp.id
  AND bp.name ILIKE '%Dubai%July%2026%'
  AND e.category_id IS NULL
  AND e.vendor_info ILIKE '%Accommodation%';

-- Food → Food
UPDATE expenses e
SET category_id = (SELECT id FROM category_master WHERE name ILIKE 'Food' LIMIT 1)
FROM budget_plans bp
WHERE e.budget_id = bp.id
  AND bp.name ILIKE '%Dubai%July%2026%'
  AND e.category_id IS NULL
  AND e.vendor_info ILIKE '%Food%';

-- Travel → Transport
UPDATE expenses e
SET category_id = (SELECT id FROM category_master WHERE name ILIKE 'Transport' LIMIT 1)
FROM budget_plans bp
WHERE e.budget_id = bp.id
  AND bp.name ILIKE '%Dubai%July%2026%'
  AND e.category_id IS NULL
  AND e.vendor_info ILIKE '%Travel%';

-- Data → Internet Phone
UPDATE expenses e
SET category_id = (SELECT id FROM category_master WHERE name ILIKE 'Internet Phone' LIMIT 1)
FROM budget_plans bp
WHERE e.budget_id = bp.id
  AND bp.name ILIKE '%Dubai%July%2026%'
  AND e.category_id IS NULL
  AND e.vendor_info ILIKE '%Data%';

-- ============================================================
-- Step 5: Add FK constraints to correct tables
-- ============================================================
ALTER TABLE expenses
  ADD CONSTRAINT expenses_category_id_fkey 
  FOREIGN KEY (category_id) REFERENCES category_master(id);

ALTER TABLE expenses
  ADD CONSTRAINT expenses_subcategory_id_fkey 
  FOREIGN KEY (subcategory_id) REFERENCES subcategory_master(id);

-- ============================================================
-- Step 6: Verify
-- ============================================================
-- SELECT COUNT(*) as total,
--        COUNT(category_id) as with_category,
--        COUNT(vendor_info) as with_vendor_info
-- FROM expenses;
