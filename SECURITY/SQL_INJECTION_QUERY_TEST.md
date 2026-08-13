# KManager SQL Injection, Query Manipulation, and Mass Assignment Report

## 1. Executive Summary
This report analyzes SQL injection (SQLi), PostgREST query manipulation, and Mass Assignment vectors within the `KManager-test` environment. The database layer and dynamic PLpgSQL functions are secure against traditional SQL injection because all queries are parameterized natively via Supabase client libraries and static PLpgSQL structures. 

However, a **CRITICAL Mass Assignment / Authorization Bypass** vulnerability was identified in the `budget_plans` table update controls. Because the database trigger `enforce_budget_plans_integrity` fails to lock status fields or restrict status transitions to authorized workflows, the creator of a budget plan can directly update its status to `APPROVED` or `PAID` via the API proxy, completely bypassing the approval workflow.

---

## 2. Query-Construction Inventory (Part A)
All database interactions are initiated via the Supabase Javascript SDK wrapper `supabaseClient` using chainable method parameters (`.from().select().eq()`). 
*   **Proxy Interaction**: Requests are forwarded through `api/supabase-proxy.js`.
*   **PostgREST Translation**: The proxy routes methods directly to PostgREST. PostgREST handles parameterization and issues prepared statements directly to PostgreSQL, preventing client-side SQL injection.

---

## 3. User-Input Data-Flow Analysis (Part B)
User input is passed to PostgREST filter operators (e.g. `eq()`, `neq()`, `in()`). Because these filters are translated into parameterized clauses internally by PostgREST, user-controlled strings cannot break out of their query parameters.

---

## 4. PostgREST Filter Manipulation Results (Part C)
Because `api/supabase-proxy.js` acts as an open proxy to PostgREST, a client can modify URL query parameters to retrieve any columns, adjust filters, or change sorting criteria.
*   **Mitigation**: This access is bounded by Supabase Row-Level Security (RLS) policies. Attempting to bypass a filter to read another team's budgets returns `[]` because RLS filters out rows where the team UUID does not match the user's roster membership.

---

## 5. SQL Injection Results (Part D & E)
*   **Database Functions & Triggers**: All triggers and database functions (such as `enforce_approval_requests_integrity`) use static SQL parameters. No instances of dynamic SQL execution (`EXECUTE` with string concatenation or `format()`) were found.
*   **Verdict**: **PASS**. The database is secure against SQL injection.

---

## 6. RPC Security Results (Part F)
*   **Invoker Privileges**: Key RPC functions like `user_has_approval_role` and `get_budget_plan_for_review` run with `SECURITY DEFINER` privileges.
*   **Validation**: They validate parameters against the caller's authenticated ID (`auth.uid()`) and verify roles against `request_role_assignments` and `users` tables, preventing parameterized authorization bypasses.

---

## 7. Mass Assignment & Field Manipulation Results (Part H)

### [Finding ID: KMAN-SEC-03] Critical Mass Assignment / Budget Status Bypass
*   **Severity**: **CRITICAL**
*   **Source**: Client-side JSON payloads in PostgREST `PATCH` requests to `/rest/v1/budget_plans`.
*   **Sink**: `public.budget_plans` (Direct row update).
*   **File/Function**: `supabase/migrations/068_fix_budget_plans_trigger.sql` (`enforce_budget_plans_integrity`)
*   **Attack Prerequisite**: User must be the creator of the target `budget_plan` (permits UPDATE access via RLS).
*   **Vulnerability Explanation**:
    The UPDATE RLS policy allows creators to update their own budget plans. The database trigger `enforce_budget_plans_integrity` locks fields like `categories`, `total_amount`, and `name` when the plan is not in `'DRAFT'` or `'REJECTED'`. However:
    1.  It does **NOT** lock the `approval_status` field.
    2.  It does **NOT** validate status transition validity (e.g., locking state changes unless they originate from the `approval_requests` trigger).
    3.  It does **NOT** restrict changes to `paid_amount` or `funding_notes` to `FIN`/`FIP` roles.
    
    Consequently, the budget creator can bypass the entire approval chain by sending a `PATCH` request to set `approval_status = 'PAID'` and `paid_amount = <total_amount>`.

*   **Harmless Proof-of-Concept payload**:
    ```json
    {
      "approval_status": "PAID",
      "paid_amount": 500.00
    }
    ```
*   **Reproduction Steps**:
    1.  Log in as a standard requester (`OPL`).
    2.  Create a budget plan (e.g., amount `$500.00`) which starts in `DRAFT`.
    3.  Issue a direct `PATCH` request to the proxy:
        `/api/supabase-proxy?path=/rest/v1/budget_plans?id=eq.<BUDGET_ID>` with the payload `{"approval_status": "PAID", "paid_amount": 500.00}`.
    4.  The server updates the record successfully. The budget is marked as approved and paid, bypassing OPH, FIN, FIH, CAO, and FIP approvals.
*   **Affected Parties**: Financial oversight and approval workflow integrity.
*   **Potential Impact**: Complete bypass of financial controls, allowing users to self-approve and mark budget allocations as paid.

---

## 8. Next Recommended Phase
Phase 5 — **Remediation Plan and Implementation** (addressing XSS and Mass Assignment vulnerabilities).
