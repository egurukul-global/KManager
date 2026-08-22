# One Kailasa V1 Discovery Report

This report documents the architectural baseline, technology stack, module boundaries, security-sensitive zones, performance bottlenecks, and code quality/maintainability risks of the One Kailasa application as of `baseline-v1`.

---

## 1. Architecture & Technology Stack

The application is structured as a Single Page Application (SPA) on the client side with a Serverless proxy API layer deployed to Vercel, interfacing with a Supabase back-end.

*   **Frontend Core**: Vanilla HTML5 structure and custom JavaScript modules.
*   **Styling**: Custom CSS (`src/styles.css`).
*   **Routing**: Custom client-side router in [main.js](file:///c:/Users/user/Documents/GitHub/KManager-test/src/main.js) triggered by `popstate` and Custom Events, integrated with One Kailasa shell routing in [okAccess.js](file:///c:/Users/user/Documents/GitHub/KManager-test/src/utils/okAccess.js).
*   **State Management**: A global mutable state object `state` defined in [state.js](file:///c:/Users/user/Documents/GitHub/KManager-test/src/state.js). Permissions are derived dynamically based on team and org roles.
*   **Offline Mirroring**: Custom offline-first sync layer in [db.js](file:///c:/Users/user/Documents/GitHub/KManager-test/src/db.js) utilizing `idb` (IndexedDB) as local storage and queuing mutations in `pending_changes` store when offline.
*   **Backend Proxy Layer**: API routes in the `/api` directory running on Vercel Node.js serverless functions:
    *   Auth flow maps: `/api/auth/login`, `/api/auth/verify`, `/api/auth/logout`, `/api/auth/migrate`, `/api/auth/refresh`.
    *   Supabase REST API requests: Routed through [supabase-proxy.js](file:///c:/Users/user/Documents/GitHub/KManager-test/api/supabase-proxy.js) to attach authorization HTTP-only cookies and perform automatic access token rotation.

---

## 2. Major Modules & Boundaries

### Admin Module
*   **Files**: [ok-admin.js](file:///c:/Users/user/Documents/GitHub/KManager-test/src/pages/ok-admin.js), [user-mgmt.js](file:///c:/Users/user/Documents/GitHub/KManager-test/src/pages/user-mgmt.js), [team-mgmt.js](file:///c:/Users/user/Documents/GitHub/KManager-test/src/pages/team-mgmt.js), [role-assignments.js](file:///c:/Users/user/Documents/GitHub/KManager-test/src/pages/role-assignments.js)
*   **Role**: Manages organizational users, teams, menu access limits (`ok_menu_access`), and workflow step roles (`request_role_assignments`).

### Finance Module
*   **Files**: [income.js](file:///c:/Users/user/Documents/GitHub/KManager-test/src/pages/income.js), [expenses.js](file:///c:/Users/user/Documents/GitHub/KManager-test/src/pages/expenses.js), [transfer.js](file:///c:/Users/user/Documents/GitHub/KManager-test/src/pages/transfer.js), [budgets.js](file:///c:/Users/user/Documents/GitHub/KManager-test/src/pages/budgets.js), [reconcile.js](file:///c:/Users/user/Documents/GitHub/KManager-test/src/pages/reconcile.js), [approval-portal.js](file:///c:/Users/user/Documents/GitHub/KManager-test/src/pages/approval-portal.js)
*   **Role**: Coordinates bucket balances, income allocations, expense tracking with receipt attachments (stored in Cloudflare R2 / Supabase Storage), inter-bucket/inter-team transfers, and multi-step approval workflows (`approval_requests`).

### Tasks Module
*   **Files**: [tasks.js](file:///c:/Users/user/Documents/GitHub/KManager-test/src/pages/tasks.js), [tasks logo.png](file:///c:/Users/user/Documents/GitHub/KManager-test/tasks logo.png)
*   **Role**: Implements a simple kanban and team task list, generating unique codes like `FIN-000456` automatically via DB triggers.

### Konnect Module
*   **Files**: [konnect.js](file:///c:/Users/user/Documents/GitHub/KManager-test/src/pages/konnect.js)
*   **Role**: Monastic communications chat hub supporting DMs, groups, and role queues, with security constraints enforcing strict messaging permissions.

### Authentication & Access Control
*   **Files**: [auth.js](file:///c:/Users/user/Documents/GitHub/KManager-test/src/auth.js), [okAccess.js](file:///c:/Users/user/Documents/GitHub/KManager-test/src/utils/okAccess.js), [navPermissions.js](file:///c:/Users/user/Documents/GitHub/KManager-test/src/utils/navPermissions.js), [userMgmtAccess.js](file:///c:/Users/user/Documents/GitHub/KManager-test/src/utils/userMgmtAccess.js)
*   **Role**: Manages cookie-based sessions, tokens, IndexedDB session fallback for offline usage, and menu visibility.

---

## 3. Database Architecture & Supabase Usage

The database schema is defined in migrations located in `supabase/migrations/`.

### Core Tables
1.  `public.users`: Matches auth credentials and stores monastic gender (`male` / `female`), org role, and messaging clearance level.
2.  `public.teams`: Holds work teams and personal teams. Features gender scope flags (`male`, `female`, `mixed`).
3.  `public.user_teams`: Direct user-team memberships with access levels (`view`, `member`, `lead`, `oht`, `admin`).
4.  `public.approval_requests`: Tracks workflows (reconciliations, budgets, transfers) with step counters (`current_step_order`) and target roles (`current_role_code`).
5.  `public.request_role_assignments`: Maps users to specific approval role codes (e.g. `FIN` pool) scoped to a team and request type.

### Major Database Functions & Triggers
*   `public.can_chat_with(user_a, user_b)`: Restricts direct messaging boundaries (cross-team and cross-gender rules).
*   `public.user_has_approval_role(p_user_id, p_role_code, p_team_id)`: Checks whether a user can act under the active workflow role.
*   `public.set_next_task_number()`: Trigger on task insertions generating unique task IDs based on team prefixes.

---

## 4. Key Risks & Bottlenecks

### Performance Risks

> [!WARNING]
> **Sequential Synchronization Loop in `syncAll`**:
> Synchronizing 8 tables sequentially on app boot/refresh (`syncAll` in [db.js](file:///c:/Users/user/Documents/GitHub/KManager-test/src/db.js)) results in high initial load times due to serial HTTP request round-trips:
> ```javascript
> for (const table of tables) {
>   results[table] = await syncTable(table, teamId);
> }
> ```

> [!WARNING]
> **Inefficient IndexedDB Wipes inside `syncTable`**:
> During synchronization, the app reads ALL local records for the table into memory using `store.getAll()`, runs a loop deleting matching team records, and inserts the fresh dataset. For large databases, this consumes high CPU time and memory:
> ```javascript
> const existing = await store.getAll();
> for (const item of existing) {
>   if (item.team_id === teamId) {
>     await store.delete(item.id);
>   }
> }
> ```

*   **Excessive Re-rendering**: Custom pages build full HTML strings dynamically and overwrite `mainContent.innerHTML` on every navigation. Modals are appended to the DOM dynamically and frequently left behind, causing memory leaks.
*   **Heavy Assets & Dynamic Imports**: Image processing libraries like `cropperjs`, canvas generators (`html2canvas`), and OCR scripts (`tesseract.js`, `jscanify`) are loaded as dependencies on build.

### Security-Sensitive Areas
1.  **Supabase Proxy Cookie Isolation**: Token rotation and cookie writes in [supabase-proxy.js](file:///c:/Users/user/Documents/GitHub/KManager-test/api/supabase-proxy.js) must strictly enforce `HttpOnly` and `Secure` to mitigate XSS session hijacking.
2.  **Row Level Security (RLS) Policies**: Database RLS rules (defined in migration scripts) restrict access to `public.messages`, `public.chat_groups`, and `public.user_teams`. Ensure no recursion cycles exist.
3.  **Segregation of Duties**: The database explicitly blocks users from approving their own submitted requests, but verification logic must reside in database triggers to prevent client-side bypass.

### Code Quality & Maintainability Risks
*   **Massive UI Modules**: Page controllers contain complex form rendering, validation, event handling, and database calls in a single file (e.g. [budgets.js](file:///c:/Users/user/Documents/GitHub/KManager-test/src/pages/budgets.js) is >3,000 lines).
*   **AI-Generated Coding Patterns**: Excessive `try/catch` wrappers without structured error reporting, hardcoded fallback configurations, and duplicate DOM generation templates.

---

## 5. Summary of Confidence Levels

*   **Confirmed from Source Code**: Proxy architecture, custom router, state layout, IndexedDB structure, offline queue mechanism, and permission mapping.
*   **Inferred by Graphify**: Betweenness centrality of core UI bridges like `showToast()` and `state`, modular cycles, and logical helper dependencies.
*   **Suspected / Requires Investigation**: Long-term reliability of transaction queue conflicts during network transitions and memory footprint of dynamic modal remnants.
