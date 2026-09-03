# Budget Template System Implementation

**Status**: Implementation complete — org-global types + templates wired into budget creation
**Date**: August 31, 2026

## Overview

The budget type template system is integrated into the Kailasa Manager finance app. This system lets finance admins (FIH/admin) to:

1. Create named budget templates
2. Assign templates to budget types (e.g., Medical, Travel, Visa, etc.) — one active template per type
3. Automatically populate new budgets with template categories **for every budget type**
4. Track which template each budget used for historical reference (`budget_plans.template_id`)

## Components Implemented

### 1. Template Manager UI  
**File**: `src/pages/category-master.js`

- **New Section**: "Budget Type Templates" tab on Category Master admin page
- **Capabilities**:
  - Add new budget templates by name and description
  - Assign each template to a budget type
  - Soft delete templates (preserves historical records)
  - One active template per budget type at a time
  - Graceful fallback when template tables don't exist yet

**Access Control**: Restricted to FIH, CAOH, OH, CEO, and org admins

### 2. Template Loading Utility  
**File**: `src/utils/budgetTemplates.js`

- `loadTemplateForBudgetType(budgetType)` – Fetch the active template for a budget type
- `loadBudgetCategoryLinesForType(budgetType)` – Load placeholder categories from the assigned template; returns empty for any type without a template (uniform rule, no monthly special case)
- `saveTemplateData(templateId, categories)` – Store template structure in `template_data` JSON field
- Graceful error handling when template tables don't exist

### 3. Budget Creation Integration  
**File**: `src/pages/budgets.js`

**Changes**:
- Import the new `budgetTemplates` utility
- Modified `seedCreateBudgetCategoryRows()` to use `loadBudgetCategoryLinesForType()`
- Track template assignment in budget record via `template_id` field
- When a new budget is created:
  - Categories are loaded from the assigned template (if one exists)
  - No template assigned ? the budget opens blank and users add line items freely (same rule for every budget type)
  - Budget record stores `template_id` for historical tracking

### 4. Navigation Update  
**File**: `src/main.js`

- Changed admin menu label from "Category Master" → "Finance Config" to better reflect dual functionality
- Finance config page now shows both category master and budget templates

## Database Schema Requirements

The system uses two new tables plus a budget_plans column, all **org-global** (budgets remain team-scoped):

### Table: `budget_types`
```sql
- id (bigserial, PK)
- code (text) – stable code stored on budget_plans.budget_type (e.g. 'medical', 'travel')
- name (text), label (text), description (text)
- is_active (boolean) – inactive types are hidden from the create-budget dropdown
- is_deleted (boolean) – soft delete flag
- seeded with the built-in types (Monthly, Medical, Travel, Passport & Visa, Legal, DR, Adhoc, Emergency, Shipping; Unallocated stays inactive/system-only)
```

### Table: `budget_type_templates`
```sql
- id (bigserial, PK)
- name (text) – template name (unique while active)
- description (text, optional)
- template_data (jsonb) – category structure: [{category, subcategory, is_mandatory}]
- is_deleted (boolean) – soft delete flag
```

### Table: `budget_type_template_assignments`
```sql
- id (bigserial, PK)
- budget_type (text) – references budget_types.code
- template_id (bigint, FK to budget_type_templates)
- is_deleted (boolean) – soft delete flag (reassignment soft-deletes the old row)
- UNIQUE(budget_type) WHERE NOT is_deleted – one active template per type
```

### Field Addition: `budget_plans` table
```sql
- template_id (bigint, nullable, FK to budget_type_templates ON DELETE SET NULL) – tracks which template was used
- budget_plans_budget_type_check constraint REMOVED (new admin-managed types are no longer blocked)
```

Migration: `supabase/migrations/20260831000000_global_budget_types_templates.sql`

## Behavior Rules

### Template Assignment
- **Org-global**: Templates and types are org-wide; budgets stay team-scoped. Any team's budget creation uses the same template for a type.
- **One active assignment per budget type**: If you assign Template A to Medical, then assign Template B to Medical, Template A is soft deleted
- **Template reuse**: The same template can be assigned to multiple budget types if needed
- **Soft delete**: When a template is deleted, its record is soft deleted rather than hard deleted

### Budget Usage
- **New budgets use current template**: When creating a budget of a given type, it loads the currently assigned template and pre-populates categories for ANY budget type (not just monthly)
- **Old budgets retain template**: Each budget record stores which template it used (via `template_id`)
- **Fallback behavior (uniform)**: If no template is assigned for a type, the budget opens blank and users add line items manually. There is no monthly special case and no category-master fallback — the old-app monthly behavior was deliberately removed
- **Ad hoc items**: Users can still add custom categories and line items beyond the template
- **Copy behavior**: Copying a previous budget copies the stored categories + line items as-is

### Monthly Budgets
- Monthly budgets keep their calendar-driven structure (calendar/naming behavior only ' + EMD + ' not a template special case)
- Monthly is handled by the SAME template rule as every other type: template assigned → seed placeholders; no template → blank entry. The old category-master fallback for monthly was removed

## Clarified Decisions (10.1–10.6)

Confirmed with finance owner:

1. **10.1 / 10.2 — Monthly already templated**: Monthly already followed the template pattern and had an active template assigned; the system applies the same pattern to all budget types.
2. **10.3 — No freeze / no SQL port needed**: Budget records are immutable snapshots. Each budget stores the `template_id` it used at creation time; assigning or changing templates affects new budgets only. The existing live budget and its expenses stay untouched — no migration or backfill required.
3. **10.4 — Template = placeholders**: A template only seeds the category placeholders users should fill. Users can always add ad hoc line items beyond the template for special needs.
4. **10.5 / uniform rule — No template → blank budget**: For ANY budget type (including monthly), if no template is assigned the budget opens blank and users add line items freely. The old-app monthly special case (category-master fallback) was removed in favor of one uniform rule.
5. **10.6 — Template reuse across types**: The same template may be assigned to multiple budget types; each type still has exactly one active template at a time.

## Payment Flow Redesign (latest)

The FIP step was removed from the budget approval flow — payment now happens in the **Transfer Funds module** (Income → Transfer Funds):

1. **Approval flow**: 1 OPH → 2 FIN → 3 FIH → 4 CAO → 5 FIH (final). FIH's step-5 approval records `budget_plans.approved_amount` (the authorized amount, full or partial) and completes the request with `FIH-APPROVED` → badge "Ready for Payment". Migration `071_budget_payment_flow_changes.sql` removes step 6 (FIP), marks step 5 final, adds `approved_amount`, protects it in the integrity trigger, allows FIH/FIP to record payments against completed requests, and adds attachment columns to `transfers`.
2. **Approval modal**: "Approval & Fund Authorization" section — FIH enters the approved amount (no longer writes `paid_amount`). The legacy `paid_amount > 0` auto-approve heuristic was removed from the approval engine (it caused premature completion at CAO time and the step-skip error at FIH).
3. **Transfer Funds → Pay Approved Budget card**: select team → lists that team's budgets with `approval_status = FIH-APPROVED`; each row shows approved + remaining (read-only) and an editable transfer amount (partial payments allowed). From = Org buckets; To = the selected team's operational buckets plus buckets of teams whose lead is an OPH. Optional proof-of-transfer upload; each row creates one transfer (`linked_budget_id` set, `paid_amount` updated) that lands in the team lead's receive queue; confirming receipt increases the team bucket.

## Form Behavior Updates (latest)

1. **Budget types come ONLY from the DB.** The create-budget dropdown is built exclusively from `state.budgetTypes` (loaded from the `budget_types` table). The hardcoded built-in list (`BUDGET_TYPES` const) is no longer used for the dropdown — it only supplies behavior defaults (calendar/naming rules). If the DB load fails, the dropdown is empty rather than showing stale hardcoded types.
2. **Parent categories are read-only totals.** When a template defines a category with subcategories (e.g. Utilities → Gas/Electricity/Water/Garbage), the budget form renders ONE parent row (Utilities) whose amount is a read-only total of its line items. The template sub items appear as line items under it, and users can add temp line items alongside. No more double counting between a parent row and its sub rows.
3. **Every line item has a comment.** Template sub items are rendered as line items (name, measure, qty, rate, total, comment), so all line items — template-based and temp — have a comment field.
4. **Totals are consistent.** A main budget category always equals the sum of its template-based line items plus additional temp line items. Line item totals are directly editable (or auto-computed from qty × rate), and the parent total + budget grand total update on every change. Template sub items cannot be removed; temp items can.

## Testing Checklist

- [ ] Navigate to Finance Config (Category Master) admin page
- [ ] Create a new budget template with name and description
- [ ] Assign the template to a budget type (e.g., Medical)
- [ ] Create a new budget of that type and verify categories are pre-populated from template
- [ ] Edit the template and verify new budgets use the updated structure
- [ ] Assign a different template to the same budget type and verify the old assignment is soft deleted
- [ ] Verify old budgets retain their original template in the `template_id` field
- [ ] Test fallback: unassign a template and verify budgets of that type open blank (uniform rule for all types)
- [ ] Test soft delete: delete a template and verify it's hidden from future use but historical records remain

## Implementation Notes

1. **Graceful Degradation**: If template tables don't exist yet, the page still loads and displays category master. Template section shows a friendly message.

2. **No Breaking Changes**: The system maintains backward compatibility:
   - Existing budgets work unchanged
   - All budget types follow the same template rule (template or blank entry); no monthly special case
   - New template functionality is additive only

3. **Build Status**: 
   - Vite build completes successfully: `✓ built in 5.13s`
   - 172 modules transformed
   - No compilation errors

4. **Access Control Pattern**: 
   - Frontend UI restricts to FIH/admin
   - Database RLS policies should also enforce access at DB level

## Future Enhancements (Not Implemented)

- Template versioning (numeric version tracking)
- Template cloning/duplication
- Template preview before assignment
- Bulk category import into templates
- Template sharing across organizations
- Template change history/audit log

## File Summary

```
New Files:
  src/utils/budgetTemplates.js        (utility for template loading / assignment lookup)
  docs/BUDGET_TEMPLATE_IMPLEMENTATION.md  (this file)
  supabase/migrations/20260831000000_global_budget_types_templates.sql  (global schema migration)

Modified Files:
  src/utils/budgetTypes.js            (DB-driven types with built-in fallback; loadBudgetTypes)
  src/pages/budgets.js                (seed template rows for ALL types, copy via template, DB type dropdown)
  src/pages/budget-types.js           (org-global types + stable `code`)
  src/pages/budget-templates.js       (org-global templates, assignment by type code)
  src/main.js                         (load org-global types at boot)
  src/state.js                        (budgetTypes cache)
  sql/create_budget_setup_tables.sql  (canonical global schema + seed + RLS)

Database Migration:
  Run supabase/migrations/20260831000000_global_budget_types_templates.sql on Supabase.
```

---

**Last Updated**: August 31, 2026  
**Build Status**: ✅ Passing  
**Implementation Phase**: Integration complete, ready for DB schema migration
