# Architecture Assessment: Finance Management & Payment Module

## Executive Summary
This document provides a comprehensive discovery, analysis, and architecture assessment of the current KManager Finance system and the proposed enhancements. The system is transitioning from a localized, team-based financial tracking model to a centralized, organization-wide financial management platform. The introduction of the Payment Module, centralized budget categories, and Org-Level Money Buckets will establish strict financial controls, enable granular tracking from budget approval to final expense, and provide executive oversight.

## 1. Existing System Assessment
Currently, KManager operates on a decentralized team-based financial model:
- **Teams:** Financial tracking (Income, Expenses, Transfers) is isolated to individual teams.
- **Money Buckets:** Defined locally within teams (`team_money_buckets`).
- **Budgets:** Approved by CAO (`budget_plans` and `approval_requests`), but funding execution (via FIH/FIP) lacks structured systemic tracking.
- **Data Model:** Core tables include `budgets`, `budget_plans`, `team_money_buckets`, `transfers`, `income`, `expenses`, and `expense_receipts`.
- **Gaps:** Lack of a dedicated payment module, no centralized "Org-Bank", categories are user-defined (leading to fragmentation), and limited global roll-up reporting.

## 2. Existing Architecture
The backend is powered by Supabase PostgreSQL with heavy reliance on RLS and PL/pgSQL triggers for workflow state machines (e.g., `approval_requests`). The frontend is likely a React/Vite SPA utilizing IndexedDB (`idb`) for offline capabilities and caching, syncing with Supabase via custom wrappers (`sbSelect`, `sbInsert`). The architecture is robust for local team operations but requires schema expansion to handle cross-team hierarchical finances.

## 3. Budget Architecture
- **Current State:** Budgets (`budget_plans`) undergo a rigid approval flow (OPH -> FIN -> FIH -> CAO).
- **Required Changes:** Budgets need to act as "authorization limits" rather than just approval documents. A budget must track `approved_amount`, `allocated_amount` (transferred to team), `direct_paid_amount` (paid to vendors), and `remaining_balance`.
- **Edge Cases:** Handling cancelled budgets that were partially paid.

## 4. Category Architecture
- **Current State:** Budget and expense categories are user-defined per team.
- **Required Changes:** Categories must be migrated to a globally managed taxonomy controlled by the Finance Manager (`FIN`/`FIH`). Teams will select from this predefined list, ensuring consistent global reporting.

## 5. Payment Module Architecture (Major New)
The Payment Module represents the execution phase of an approved budget.
- **Payment Lifecycle:** Draft -> Submitted -> Paid.
- **Destinations:** 
  1. **Allocate to Team:** Transfer to a team's local bucket.
  2. **Direct to Vendor:** Payment bypassing team buckets.
  3. **To Intermediary (OPH):** Handled as a temporary advance.
- **Constraints:** Payments can only be executed against CAO-approved budgets. Total payments cannot exceed the approved budget amount.

## 6. Organization-Level Money Buckets
- **Concept:** Introduction of global buckets (e.g., ORG-BANK, ORG-CASH) managed exclusively by `FIH`.
- **Access Control:** `FIP` (Finance Processing) will have restricted execution access to these buckets based on workflow assignments.
- **Implementation:** Expand `buckets` table to support an `is_org_level` flag, detaching them from strict `team_id` requirements.

## 7. CAO / CEO Complete Read Access
- **Requirement:** Executives must have unrestricted read access to all financial data.
- **Implementation:** Existing custom functions (`user_has_approval_role`) and RLS policies (e.g., `is_org_admin()`) currently handle this. We need to ensure new Payment and Org-Bucket tables include RLS bypasses for `CAO` and `CEO` global roles.

## 8. Fund Transfers vs. Payments
- **Clarification:** 
  - *Fund Transfer:* Moving money between buckets without affecting budget utilization (e.g., ORG-BANK to ORG-CASH, or Team-Bank to Team-Cash).
  - *Payment (Allocation):* Moving money from an ORG bucket to a TEAM bucket *linked to a specific budget*. This counts against the budget's available balance.

## 9. Cash Payments
- **Concept:** Payments made directly in cash that do not land in a destination system bucket.
- **Tracking:** Must immediately deduct from an Org-Cash bucket and register as a fully utilized payment against the budget.

## 10. Bulk Payments
- **Requirement:** A single outgoing financial transaction (e.g., a wire transfer of $10,000) that satisfies multiple approved budgets (e.g., 5 budgets of $2,000 each).
- **Data Model:** Requires a `payments` header table and a `payment_lines` mapping table linking individual amounts to specific `budget_plans`.

## 11. Partial Payments
- Budgets can be paid in installments. The system must enforce that the `SUM(payment_lines.amount) <= budget_plans.total_amount`.

## 12. Budget Reconciliation & Remaining Funds
- **Formula:** `Remaining Budget = Approved Amount - (Allocated to Team + Direct Paid)`.
- **System Integrity:** This should ideally be a derived view or calculated field backed by database triggers to prevent data anomalies.

## 13. Payment History & Auditability
- **Tracking:** Every payment must log the `created_by`, `approved_by`, timestamps, and source/destination buckets.
- **Documents:** `payment_attachments` table needed for receipts/proofs of transfer.

## 14. Interactions with Existing Modules (Income)
- **Risk:** Money transferred from ORG to TEAM via a Payment Allocation must *not* be manually logged as "Income" by the team, which would double-count revenue.
- **Solution:** System-generated transfers must be locked and clearly flagged as `source: allocation` in the team's ledger.

## 15. Questions for Me (Business Owner)
1. **Multi-Currency:** Should the system lock exchange rates at the time of Budget Approval, or at the time of Payment Execution?
2. **Intermediary Accountability:** When OPH receives an intermediary payment, what is the exact timeline and process for them to return unspent funds?
3. **Vendor Management:** Do we need a formalized `vendors` table, or is a text field sufficient for "Direct to Vendor" payments?

## 16. Recommended Architecture
- **Schema Additions:**
  - `global_categories`: Managed by FIN.
  - `org_buckets`: Managed by FIH.
  - `payments` & `payment_lines`: Linking transactions to budgets.
  - `payment_attachments`: R2/S3 linked documents.
- **Workflow State Machine:** Leverage the existing `approval_requests` architecture to manage Payment approval flows if FIH needs to approve FIP's drafts.

## 17. Recommended Development Phases
- **Phase 1: Foundation.** Implement Global Categories and Org-Level Buckets. Migrate existing team categories.
- **Phase 2: Payment Engine.** Build `payments`, `payment_lines`, and core validation logic (Partial/Bulk payments).
- **Phase 3: Integration & UX.** Update the Manager-Finance dashboard. Link Budgets to Payments.
- **Phase 4: Expense Reconciliation.** Implement strict accountability loops for allocated funds.

## 18. Expense Accountability and Reconciliation
- **Flow:** Budget Approved -> Allocated to Team -> Expenses Logged Against Budget -> Budget Closed.
- **Unused Funds:** When a budget is closed, any `Allocated Amount - Logged Expenses` represents "Money Held". This must be formally returned to the Org-Bucket or rolled over.
- **Dashboard:** The Finance Dashboard must highlight "Aging Budgets" (approved but unallocated) and "Unreconciled Budgets" (allocated but missing expense logs).
- **Derived Totals:** Rely on dynamic SQL views for real-time balances to eliminate accumulation risk and ensure absolute financial integrity.
