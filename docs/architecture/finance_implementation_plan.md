# Finance Management & Payment Architecture Implementation Plan

This document outlines the technical impacts, schema changes, and phased development plan to build the centralized Finance system based on our agreed business rules.

## User Review Required

- **CSV Structure:** We will add CSV export to the existing Expense Reports. The CSV will include columns: Date, Expense Item, Category, Amount, Currency, and Status.
- **Deprecating Old "Income" for Internal Transfers:** The existing direct "Add Income" form will be locked down for internal funds. All internal movement (Org -> Team, etc.) will enforce the strict two-part handshake (Send -> Accept) via the Unified Transfer Engine. "Add Income" will solely be used for external money (e.g., cash handed to the organization from an external donor).
- **Phased Rollout:** I have updated the development phases below to include the Management Reporting suite and export capabilities you requested. Please review the order.

## Proposed Changes

### Phase 1: Foundation & Unified Handshake Engine
*Code Impact: High (Database schema & core API/UI for transfers)*

We will expand the existing `transfers` state machine (which currently handles `PENDING`, `ACCEPTED`, `REJECTED`) to be the single source of truth for ALL money movement.

#### [MODIFY] `supabase/migrations/[new_migration]_unified_transfers.sql`
- Expand `transfers` table to explicitly link to `budget_id`.
- Support Org-Level buckets (e.g., `ORG-BANK`) as valid senders/receivers.
- Ensure the state machine triggers a Konnect message on `PENDING` requiring the receiver's `ACCEPTED` action.
- Add fields for `exchange_rate_approval` and `exchange_rate_disbursement`.

#### [MODIFY] `src/pages/income.js` & `src/pages/transfers.js`
- Block the ability to use "Add Income" for internal Org/Team fund receipts.
- Upgrade the Transfer UI to handle upward (Team->Org) and downward (Org->Team) transfers, provided the user has the correct permissions (FIH/FIP vs Team Lead).

### Phase 2: Budget Closure & Unused Funds
*Code Impact: Medium (Database formulas and Budget UI)*

#### [MODIFY] `supabase/migrations/[new_migration]_budget_reconciliation.sql`
- Add a virtual or explicit bucket for `UNUSED_FUNDS`.
- Create a dynamic view `budget_reconciliation_view` that calculates: `remaining_balance = allocated_amount - expenses_submitted - unused_funds_returned`.

#### [MODIFY] `src/pages/budgets.js`
- Implement a "Close Budget" action.
- Ensure closure triggers a forced transfer of any remaining bucket balance to the `UNUSED_FUNDS` bucket via the two-part handshake. The budget is not fully closed until Finance accepts the return transfer.

### Phase 3: Management Reporting & Reconciliation Dashboard
*Code Impact: High (New Manager module, filtering, exports)*

#### [NEW] `src/pages/manager-finance.js`
- Create the "Manager - Finance" view restricted to CEO, CAO, FIN, FIH.
- Implement actionable queues:
  - **Reconciliation Queue:** Budgets where expenses + balances don't match allocations.
  - **Financial Action Queue:** Pending incoming transfers to Org, open budgets past deadline.
- Build robust data filters: Filter by Org, Team, Lead, Date Range, Category, and Budget Status.

#### [NEW] `src/utils/exportCsv.js`
- Create a reusable utility for generating CSV blobs and downloading them.

#### [MODIFY] `src/pages/manager-finance.js`
- Integrate `exportExpenseReportToPdf` and the new CSV utility to ensure all Management reports can be downloaded in both formats.

### Phase 4: Expense Module Integration & CSV Retrofit
*Code Impact: Low (Retrofitting existing components)*

#### [MODIFY] `src/pages/expense-reports.js`
- Add an "Export to CSV" button next to the existing "Export to PDF" button.
- Wire the new CSV utility to parse the generated expense report data.

## Verification Plan

### Automated / DB Verification
- Check RLS policies using test roles (`CAO`, `FIH`, `Team Lead`) to ensure a Team Lead cannot directly withdraw from `ORG-BANK`.
- Verify the math in `budget_reconciliation_view` accurately forces to zero when unused funds are returned.

### Manual Verification
- Execute an end-to-end flow:
  1. CAO approves $1000 budget.
  2. FIH transfers $500 to Team Lead (Pending).
  3. Team Lead accepts $500.
  4. Team Lead logs $400 in expenses.
  5. Team Lead clicks "Close Budget" -> triggers return transfer of $100.
  6. FIH accepts $100.
  7. Verify Manager - Finance dashboard shows the budget perfectly reconciled.
- Test PDF and CSV downloads for expense reports and management reports.
