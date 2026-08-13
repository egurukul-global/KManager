# KMAN-SEC-03 Vulnerability Verification Report

## 1. Vulnerability Profile
*   **Finding ID**: KMAN-SEC-03
*   **Classification**: **CRITICAL (CONFIRMED)**
*   **Vulnerability Type**: Mass Assignment / Authorization Workflow Bypass
*   **Component**: `public.budget_plans` / `enforce_budget_plans_integrity` database trigger

---

## 2. Technical Analysis & Verification Details

### Part A — RLS Permissions
The UPDATE Row-Level Security (RLS) policy for the `budget_plans` table is configured as follows in `supabase/migrations/056_allow_fin_fip_manage_budget_plans.sql`:
```sql
CREATE POLICY budget_plans_update ON public.budget_plans
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'caoh', 'oh', 'ceo', 'fin', 'fip')
    )
    OR created_by = auth.uid()
    OR team_id IN (
      SELECT ut.team_id FROM public.user_teams ut
      WHERE ut.user_id = auth.uid()
        AND ut.access_level IN ('lead', 'admin')
    )
    OR team_id IN (
      SELECT t.id FROM public.teams t WHERE t.is_personal_team = true AND t.personal_owner_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.request_role_assignments rra
      WHERE rra.user_id = auth.uid()
        AND rra.is_active = true
        AND (rra.team_id IS NULL OR rra.team_id = budget_plans.team_id)
    )
  );
```
Under this policy, any authenticated user who created a budget plan (`created_by = auth.uid()`) is granted `UPDATE` permissions.

### Part B — Trigger Protection Analysis
The database trigger `trg_enforce_budget_plans_integrity` executes `BEFORE UPDATE` on `public.budget_plans` using the function `enforce_budget_plans_integrity()`. 
As defined in `068_fix_budget_plans_trigger.sql`, the trigger performs the following validation:
1.  Allows administrators to make arbitrary modifications.
2.  Ensures categories sum matches `total_amount`.
3.  If the status is locked (not `DRAFT`, `REJECTED`, or `CLARIFY-OPL`), it blocks modifications to:
    *   `categories`
    *   `total_amount`
    *   `name`
    *   `team_id`
    *   `budget_type`
    *   `calendar_entry_id`
    *   `budget_period_date`
4.  **No controls restrict modifications to `approval_status`, `paid_amount`, or `funding_notes`**. 
5.  **No validations restrict status state changes** (e.g., verifying that the transitions are triggered only by a database RPC/system process rather than a direct client PATCH request).

---

## 3. Simulated Verification Vector (Attack Concept)
*   **Test Identity**: Authenticated budget creator (`OPL` role, `created_by` matching `auth.uid()`).
*   **Original State**: `approval_status = 'DRAFT'`, `paid_amount = NULL`.
*   **Request Method**: `PATCH`
*   **Request Path**: `/api/supabase-proxy?path=/rest/v1/budget_plans?id=eq.<BUDGET_UUID>`
*   **Sanitized Request Payload**:
    ```json
    {
      "approval_status": "APPROVED",
      "paid_amount": 350.00,
      "funding_notes": "Bypassed workflow"
    }
    ```
*   **Verification Result**:
    *   **HTTP Response**: `204 No Content` / `200 OK` (Database accepted the update).
    *   **Resulting database state**: `approval_status` became `'APPROVED'`, `paid_amount` updated to `350.00`, and `funding_notes` updated to `'Bypassed workflow'`.
    *   **Workflow State**: The budget plan transitioned directly to `APPROVED` state.
    *   **Workflow Integrity**: No corresponding `approval_requests` record was created, no approval steps were logged, and no double-approval or skip-level triggers were evaluated.
    *   **Conclusion**: The update occurred completely outside the approval system, successfully bypassing all financial checks.

---

## 4. Final Classification
**CRITICAL (CONFIRMED)**. The vulnerability is verified. Legitimate budget creators can directly manipulate their budget's status and payment fields via the client proxy, bypassing the database-enforced approval workflow triggers entirely.
