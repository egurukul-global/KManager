# Tasks: Finance Management & Payment Architecture

## Phase 1: Foundation & Unified Handshake Engine
- `[x]` Create DB migration `XXX_unified_transfers.sql`
  - Expand `transfers` table for `budget_id`, Org-Level buckets.
  - Enforce state machine triggers for Konnect messages.
  - Add exchange rate fields.
- `[x]` Modify `src/pages/income.js`
  - Block "Add Income" for internal Org/Team receipts.
- `[x]` Modify `src/pages/transfer.js`
  - Upgrade UI for upward and downward transfers based on roles.

## Phase 2: Budget Closure & Unused Funds
- `[x]` Create DB migration `XXX_budget_reconciliation.sql`
  - Create `UNUSED_FUNDS` concept/bucket.
  - Create dynamic view `budget_reconciliation_view`.
- `[x]` Modify `src/pages/budgets.js`
  - Implement "Close Budget" action.
  - Force unused funds transfer with handshake.

## Phase 3: Management Reporting & Reconciliation Dashboard
- `[x]` Create `src/utils/exportCsv.js`
  - Build reusable CSV generation utility.
- `[x]` Create `src/pages/manager-finance.js`
  - Build Manager-Finance view for CEO/CAO/FIN/FIH.
  - Implement actionable queues (Reconciliation, Financial Action).
  - Build robust data filters.
  - Integrate PDF and CSV export utilities.

## Phase 4: Expense Module Integration & CSV Retrofit
- `[x]` Modify `src/pages/expense-reports.js`
  - Add "Export to CSV" button.
  - Wire up `exportCsv.js` parsing logic.
