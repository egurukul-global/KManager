# KManager Security Reconnaissance Report

## 1. Executive Summary
This report presents the security reconnaissance and attack-surface mapping of the KManager application. The assessment was performed in a local test/development environment (`KManager-test`) to categorize modules, trust boundaries, data flows, inputs, and controls systematically. No destructive testing or active vulnerability exploits were executed in this phase.

## 2. Application Architecture
*   **Frontend Framework/Build System**: Built as a pure vanilla Javascript and single-page HTML application structured with components in `src/pages/` and utilities in `src/utils/`. Vite is utilized as the build tool and development server (`vite.config.js` and `package.json`).
*   **Major Application Modules**:
    *   **Dashboard (`dashboard.js`)**: Overview of active budgets, tasks, and notifications.
    *   **Budgets (`budgets.js`)**: Multi-step wizard and budget proposal management.
    *   **Approval Portal (`approval-portal.js`)**: Interface for request inspection and approval workflow state-machine triggers.
    *   **Konnect Chat (`konnect.js`)**: Real-time collaborative messaging, file sharing, and notification feeds.
    *   **Tasks Board (`tasks.js`)**: Kanban-style project management.
    *   **Team & User Management (`team-mgmt.js`, `user-mgmt.js`)**: Roster, capabilities, and hierarchical organizational setup.
*   **Authentication Architecture**: Supabase Authentication integration via `/api/auth/` cookies (`sb-access-token` and `sb-refresh-token`). Token rotations are handled through a local API server middleware proxy (`api/supabase-proxy.js`).
*   **Authorization/RBAC Architecture**: A combination of:
    *   *Global Roles* (`admin`, `caoh`, `oh`, `fin`, `fip`, mapped in `users.role` table column).
    *   *Team-Specific Roles* (Team Leads, Member access levels mapped in `user_teams.access_level`).
    *   *Explicit Workflow Roles* (Defined in `request_role_assignments` table).
*   **Supabase / Database Usage**: Database integration is hosted on Supabase (PostgreSQL). Interaction is performed via PostgREST/Supabase JavaScript client wrapper `supabaseClient` and dynamic Postgres RPC functions.
*   **Local-First / IndexedDB & Offline Sync**: Uses IndexedDB (via `idb` library wrapped in `src/db.js`) to cache local buckets, categories, income, expenses, and budget plans. Offline modifications are queued in a `pending_changes` store and synchronized using the `pushPendingChanges` wrapper once connection is re-established.
*   **API / RPC Architecture**: A local API proxy (`api/supabase-proxy.js`) forwards requests with credentials to Supabase REST and RPC endpoints.
*   **File Upload/Download**: Direct bucket attachment functionality implemented via standard HTTP multipart request parameters.

---

## 3. Attack-Surface Inventory
*   **Pages & Routes**: Single page application mounting different screens dynamically based on state (`src/pages/*`).
*   **API Endpoints**:
    *   `/api/auth/login` (Auth validation)
    *   `/api/auth/logout` (Cookie invalidation)
    *   `/api/auth/verify` (Token confirmation)
    *   `/api/supabase-proxy?path=<endpoint>` (Generic Supabase PostgREST bypass)
*   **Database Tables**:
    *   `public.users`, `public.teams`, `public.user_teams`, `public.budget_plans`, `public.approval_requests`, `public.approval_flow_definitions`, `public.approval_flow_steps`, `public.request_role_assignments`, `public.messages`, `public.expenses`, `public.transfers`.
*   **Supabase RPCs**:
    *   `notify_approval_actors`, `user_has_approval_role`, `get_budget_plan_for_review`, `get_next_active_workflow_step`.
*   **Database Triggers**:
    *   `trg_enforce_approval_requests_integrity` (on `approval_requests`)
    *   `trg_sync_income_local_amount` (on `income`)
    *   `trg_auth_user_created` (on `auth.users`)
*   **Client Caching**:
    *   IndexedDB stores: `buckets`, `categories`, `budget_plans`, `pending_changes`, `sync_meta`, `expenses`, `transfers`.

---

## 4. Trust Boundaries
Data crossings occur at the following logical borders:
1.  **User Input → Browser DOM**: String rendering via `innerHTML` / templates.
2.  **Browser App → Local API Proxy**: Cookie transfer and JWT validation.
3.  **Local API Proxy → Supabase API**: Token delegation and SQL validation.
4.  **IndexedDB Cache → Sync Pipeline**: Synchronization of queued JSON structures to server tables.
5.  **Multi-Tenant Separations**:
    *   *Team Tenant Boundary*: Separating Team A members from Team B budget data.
    *   *Role Tenant Boundary*: Separating standard requestors from payment/admin operations.

---

## 5. Security-Critical Operations
*   **Budgets**: Creating, editing, archiving, and final submission.
*   **Approval State-Machine**:
    *   OPH approval (Step 1)
    *   FIN review (Step 2)
    *   FIH review (Step 3 / Step 5)
    *   CAO approval (Step 4 - core authorization)
    *   FIP payment authorization (Step 6)
*   **Clarification Requests**: Moving status to `CLARIFY-OPL` / requester reply triggers.
*   **Access Management**: Editing rosters, altering roles, changing hierarchy relations.

---

## 6. Input Surface Inventory
*   **Text/Form Fields**: Budget forms, task names, comment inputs, housing address details.
*   **File Uploads**: Receipt files, screenshots.
*   **Dynamic Queries**: Search filters and inbox searches.
*   **URL / Image Sources**: Reference link attachments.

---

## 7. Security-Sensitive Code Patterns
*   **innerHTML Usage**: Heavily used across all dynamic pages (`approval-portal.js`, `budgets.js`, `tasks.js`, `konnect.js`) to render layouts and data tables.
    *   *Status*: Requires Verification. While custom wrappers like `escapeHtmlAttr()` are used in several views, direct evaluation of user-submitted comments or names must be systematically verified to avoid Cross-Site Scripting (XSS).
*   **Dynamic Imports**: Used dynamically for loading pages and utilities (`approvalEngine.js`, `idb` packages).
*   **Supabase PostgREST Filters**: URL-constructed criteria passed directly to PostgREST endpoints.

---

## 8. Secret Exposure Locations (Redacted)
*   **Location**: `src/db.js` (Lines 4-5)
    *   *Type*: Supabase Project URL (`SUPABASE_URL`) & Anon API Key (`SUPABASE_ANON_KEY`).
    *   *Status*: Redacted & public (intended client-facing anon key).
*   **Location**: `api/supabase-proxy.js` (Lines 3-4)
    *   *Type*: Default/Fallback Supabase project URL and Anon API key.
    *   *Status*: Redacted & public (fallback).

---

## 9. Dependency & Security Tooling Inventory
*   **Package Manager**: `npm`
*   **Dependency Files**: `package.json`, `package-lock.json`
*   **Major Dependencies**: `@supabase/supabase-js`, `idb`, `vite`.
*   **Audit Command**: Available via `npm audit`.

---

## 10. Existing Security Controls (Requires Verification)
*   **Authentication**: Controlled via HTTP-only session cookies and JWT verification at the proxy layer.
*   **Authorization**: Supabase Row-Level Security (RLS) tables and database triggers.
*   **Database Constraints**: Foreign keys and database integrity triggers (like `enforce_approval_requests_integrity`).
*   **Sanitization**: `escapeHtmlAttr()` function in `budgets.js` and `uiHelpers.js`.

---

## 11. Unknowns & Gaps
*   Verification required on whether arbitrary users can manipulate HTTP headers to bypass the local proxy server.
*   Potential IDor risks in direct PostgREST table querying (needs verification if RLS policies are strictly applied to all tables).
*   Input sanitization gaps in chat messages/comments.

---

## 12. Recommended Testing Sequence
1.  **XSS Verification**: Scan template parameters in `innerHTML` rendering.
2.  **RLS Leak Analysis**: Inspect RLS configuration for table access via proxy client.
3.  **Role Escapes**: Attempt to act on step 4 (CAO) as a standard OPL/FIN user.
4.  **Bypass Testing**: Validate proxy middleware validation checks.
