# Finance Budget Type, Template, and Category Admin Requirements

Status: Requirements/specification only. No implementation changes made.

## 1. Purpose

This feature defines the org-level finance configuration for:

- category master
- budget types
- templates
- assignment of templates to budget types
- soft deletion and restore behavior
- ad hoc budget line items at the budget instance level

The goal is to let the finance team create reusable budget structures for multiple budget types while preserving the flexibility of the existing budget creation flow.

---

## 2. Scope and principles

1. Templates are org-wide, not team-specific.
2. Budget types are global org definitions.
3. Budgets themselves remain team-level records.
4. One active template can be assigned to one budget type at a time.
5. The same template can be reused by multiple budget types if the finance admin chooses.
6. Old budgets retain the template they used when created.
7. New budgets use the newly assigned template.
8. The app must remain flexible so users can add ad hoc line items inside a budget when required.
9. Soft delete must be used when an item has ever been referenced by any budget record.
10. Historical record integrity must be preserved.

---

## 3. Roles and access

### 3.1 FIH / admin ownership

FIH/admin owns the finance admin configuration permissions.

This includes access to:
- category master
- budget type manager
- template manager
- template assignment management

### 3.2 Finance manager access

Other users such as FIN, FIP, or delegated finance users may be granted access to the manager/admin area by the FIH/admin.

Important distinction:
- manager view access is not the same as metadata admin access
- admin metadata management is a separate configuration permission
- approval roles and config roles are separate concepts

### 3.3 Database and RLS requirement

Access control for finance configuration tables must be enforced in the DB/RLS layer, not only in UI visibility.

The front-end can hide or show menus, but the real access enforcement must also exist in the database policies.

---

## 4. Category master

The category master is the org-level catalog of allowed categories.

### 4.1 Purpose

The category master defines the fixed categories available for templates and budget entries.

### 4.2 Rules

- categories are org-wide
- categories can be created, edited, and soft deleted
- categories can be marked as mandatory or optional
- category names are user-defined
- categories may be used in templates and actual budgets

### 4.3 Add / edit / delete

The category master UI shall support:
- add category
- edit category name
- update mandatory flag
- soft delete category
- restore deleted category if allowed by policy

### 4.4 Soft delete rule

If a category has ever been referenced in any past or present budget record, it must be soft deleted rather than hard deleted.

Soft-deleted categories shall:
- remain visible for historical records
- be hidden from active selection lists
- not be available for future use
- not be used in new budgets

---

## 5. Budget types

Budget types are org-level definitions used to classify budgets.

### 5.1 Purpose

Budget types allow finance to define the different kinds of budgets used by the organization, such as:
- medical
- travel
- visa
- monthly
- emergency
- adhoc
- other finance-specific categories

### 5.2 Rules

- budget types are global, not per team
- budgets themselves remain team-level records
- only finance admins may define or modify budget types
- budget types are available to all teams, subject to permission rules

### 5.3 Add / edit / delete

Finance admin may:
- add a new budget type
- rename or edit a budget type
- soft delete a budget type
- restore a soft-deleted budget type if policy allows

### 5.4 Soft delete rule

If a budget type has ever been used by any budget record, it must be soft deleted, not hard deleted.

Soft-deleted budget types shall:
- remain visible in historical reports
- be hidden from future new budget creation
- be unavailable in dropdowns for new budgets

---

## 6. Templates

A template is a named saved collection of categories used as the starting format for a budget type.

### 6.1 Purpose

Templates standardize the structure of the budget form for a given budget type.

Examples:
- Medical1
- Medical2
- TravelQ1
- VisaStandard

### 6.2 Rules

- templates are org-wide
- templates are named manually by user/admin
- templates can be globally reused across multiple budget types if needed
- one budget type has one active template assignment at a time
- old budgets retain the template they used
- new budgets use the newly assigned template

### 6.3 Assignment rule

The finance admin can assign a template to a budget type.

If the budget type already has an active template:
- the admin may replace it with another named template
- all new budgets created after that change use the new template
- old budgets keep the previous template assignment

This must be treated as a business assignment, not software versioning.

### 6.4 Template naming

Templates are separate entities with user-given names such as:
- Medical1
- Medical2
- Travel Standard
- Visa Q2

There is no requirement for numbered software versions or internal version metadata.

### 6.5 Template reuse

A template may be assigned to multiple budget types if the finance admin chooses.

This is intentionally simple and flexible.

---

## 7. Budget copy behavior

The existing approved-budget copy functionality must remain available across all budget types.

### 7.1 Rule

If a budget is copied:
- the duplicate starts from the original budget structure
- the copied budget becomes a new record
- historical relationships remain preserved
- the same behavior applies to all budget types, not only monthly

### 7.2 Template impact

When a budget is copied, it should preserve the template-driven structure at the time of copy unless the user edits it after creation.

This ensures that copying behavior remains consistent across the app without breaking current finance flows.

---

## 8. Soft delete behavior

Soft delete is required for all metadata and historical safety.

### 8.1 Rule

Any item that has ever been referenced in any budget record should be soft deleted rather than hard deleted.

This includes:
- category master entries
- subcategories
- budget types
- templates

### 8.2 Intended behavior

Soft-deleted items shall:
- remain available for historical integrity
- not appear in future dropdowns and active selections
- not be usable in new budgets
- be visible in an admin “show deleted” view if needed
- not break payment, approval, or historical references

### 8.3 Restore behavior

If an item is soft deleted but not yet used in ongoing finance operations, a restore option may be allowed by admin policy.

If it is referenced in any historical budget, restore is allowed only if the business rules permit reactivation; otherwise it should remain hidden from new use but still preserved for audit purposes.

---

## 9. Ad hoc budget lines

The existing app flexibility for user-added budget line items must remain intact.

### 9.1 Rule

A budget instance may still have ad hoc additional line items beyond the standard template structure.

### 9.2 Important distinction

- template items are shared structured definitions
- ad hoc items are per-budget custom entries
- ad hoc line items are not treated as temporary global categories
- they are just line items on the specific budget

This preserves the current flexible operating model without turning all templates into rigid data definitions.

---

## 10. Monthly budget handling

Monthly budgets already follow a template-like pattern today.

### 10.1 Rule

This new template system must generalize the same pattern to all budget types, not just monthly.

### 10.2 Monthly behavior

Monthly should continue to behave as follows:
- it is tied to the org period/calendar model
- it uses the active template assigned for that monthly pattern
- older monthly budgets continue to refer to the template they used at creation time
- new monthly budgets use the newly assigned template

This is not a new special-case branch; it is the same design applied more broadly.

### 10.3 Clarified decisions (confirmed with finance owner)

- **Uniform template rule for ALL budget types.** For any budget type selected, the app searches the DB for an active template. If one exists, the new budget opens seeded with that template's category placeholders and users may add additional line items. If no template exists, the budget opens blank and users add line items freely. There is no monthly special case — the old-app monthly fallback to category master was deliberately removed.
- **No freeze of past budgets and no SQL port/backfill is required.** Existing budget records are self-contained snapshots (categories, line items, expenses). `budget_plans.template_id` only records which template a budget used at creation time. Assigning or changing templates affects new budgets only; existing budgets and their expenses are never rewritten. The important live budget with its expenses continues to work unchanged.
- **Templates are placeholders, not constraints.** A template enforces which categories users should fill in; users can always add extra line items on a budget for special needs not covered by the template (ad hoc lines per section 9).
- **Template reuse across budget types.** The same template can be assigned to several budget types. Each budget type still has exactly one active template at a time.

---

## 11. UI requirements

### 11.1 Finance admin screen layout

The admin section should clearly separate:
- Category Master
- Budget Types
- Templates

### 11.2 Existing UI conventions

The new screens must follow the existing app conventions for:
- cards
- forms
- buttons
- badges
- delete/restore toggles
- mobile-responsive layouts
- existing color scheme and styling

No major design change is required.

### 11.3 Deleted item handling

Where the app already uses a show-deleted toggle pattern, this feature should follow the same standard so that deleted records remain visible for review when explicitly requested.

---

## 12. Verification checklist

This requirement set is considered fulfilled when the following behaviors are in place:

### Access and security
- [ ] FIH/admin owns the finance config permissions
- [ ] other users can be granted access separately
- [ ] metadata admin access is separate from manager access
- [ ] DB/RLS enforces the config table permissions

### Category master
- [ ] category master is org-wide
- [ ] categories can be added/edited
- [ ] categories can be soft deleted when used
- [ ] deleted categories are hidden from new use

### Budget type manager
- [ ] budget types are global
- [ ] budget types can be added/edited
- [ ] soft delete is used when ever referenced
- [ ] new budgets do not use deleted types

### Template manager
- [ ] templates are named and reusable
- [ ] templates are org-wide
- [ ]-budget type active assignment is one template at a time
- [ ] the same template can be reused by multiple budget types
- [ ] old budgets continue to keep their original template association

### Copy and budget behavior
- [ ] approved budgets can be copied across all budget types
- [ ] ad hoc line items remain allowed on budgets
- [ ] template changes do not rewrite old budget records

### Historical safety
- [ ] soft delete prevents future use of any referenced item
- [ ] historical records remain intact
- [ ] soft-deleted items can be shown in admin review

---

## 13. Final status

This requirement document captures the intended behavior for the finance configuration layer without introducing software versioning or unnecessary complexity.

It preserves the current flexible budgeting model while adding a reusable template system for finance-managed budget types.

This is the specification to be used for later verification against the implementation.
