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

### Phase 2.3: Manager View - Reports (Team Report)
- [x] Add "Team Report" to Reports section of sidebar (Manager view).
- [x] New page `src/pages/manager-team-report.js`: one row per active, approved, non-closed budget.
- [x] Columns: Team | Approved Budget | Budget Amount | Approved Amount | Allocated (Sent) | Received (Accepted) | Pending | Expenses, with totals row.
- [x] Filters: date range (budget period), Teams (multi-select), Budgets (multi-select), text search.
- [x] CSV and PDF export of the currently filtered rows.
- [x] Migration `076_team_report_view.sql`: view gains `received_amount` (ACCEPTED transfers only), `allocated_amount` now includes PENDING + ACCEPTED, exposes `budget_status`. **MUST be run in Supabase.**
- Note: Allocated and Received columns display the same value until the migration is applied to the database.

- [x] Fix "Expenses Timeline" in Profile Settings to filter by Custom Budget Calendar Periods, not Gregorian months.
