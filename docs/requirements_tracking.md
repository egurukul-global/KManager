# Phase 2: Expense Engine & Finance Management
## Master Requirements Tracking

### Phase 2.1: Receivables (Manager Finance)
- [x] Rename "Manager Finance" to "Receivables" in sidebar and page titles.
- [x] Add Text Search (by Team, Budget) to Receivables.
- [x] Add Date Range filters (From / To) mapped to valid Budget Calendar dates.
- [x] Add Detailed vs Summary View toggles.
- [x] In Summary View, group by Team.
- [x] In Summary View, group by Person (Requester).
- [x] In Summary View, group by OPH.

### Phase 2.2: Global Expense Manager & Approval Engine
- [x] Add "Expense Manager" to Manager view sidebar.
- [x] Database: Add `is_submitted`, `is_reviewed`, `review_notes` to `expenses` table.
- [x] Team UI: "Submit for Finance Review" checkbox on Expense Entry (checked by default).
- [x] Team UI: Mandatory receipt enforcement for "Submit for Finance Review".
- [x] Team UI: Show "Needs Correction" warning if `review_notes` exist and `is_submitted` is false.
- [x] Manager UI: Global "Pending Reviews" queue loading cross-team expenses.
- [x] Manager UI: Checkboxes to bulk-mark expenses as "Reviewed".
- [x] Manager UI: "Send Back" option to reject an expense and add `review_notes`.
- [x] Global: Block Budget Closure if any expenses remain un-reviewed.

### Additional Dashboard Requirements
- [x] Add "Outstanding Amount" blob to Dashboard.
- [x] Add "Logged Expenses" blob to Dashboard.
- [x] Fix "Expenses Timeline" in Profile Settings to filter by Custom Budget Calendar Periods, not Gregorian months.
