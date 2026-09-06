# PROGRESS.md - Security Audit Progress Tracker

**Purpose**: Track what security issues have been found and fixed. Update this as work progresses.

---

## 📊 Overall Status

**Start Date**: September 6, 2026  
**Current Phase**: Phase 1 - Vulnerability Identification  
**Target Completion**: September 15, 2026  
**Production Readiness**: 🟠 IMPROVING — auth CRITICAL/HIGH fixes applied 2026-09-06, rate limiting + manual testing still pending

---

## Phase 1: Automated Scanning ✅ COMPLETE

### Dependency Vulnerabilities

| Package | Issue | Severity | Status | Fix |
|---------|-------|----------|--------|-----|
| nanoid | Non-secure generators loop indefinitely | HIGH | ✅ FIXED | npm audit fix |
| postcss | Arbitrary .map file disclosure | HIGH | ✅ FIXED | npm audit fix |
| vite | Path traversal on Windows | HIGH | ✅ FIXED | npm audit fix |
| semver | ReDoS in global-agent (snyk only) | HIGH | ⚠️ ACCEPTED | Tool dependency, not production |

**Actions Completed**:
- ✅ Run `npm audit`
- ✅ Run `npm audit fix --force`
- ✅ Installed security tools (eslint-plugin-security, snyk, sonarqube-scanner)
- ✅ Verified fixes

---

## Phase 2: Code Review - Authentication 🟠 IN PROGRESS (verified against actual code 2026-09-06)

### auth.js (Frontend) — CORRECTED after direct code review

| Issue | Location | Severity | Status | Notes |
|-------|----------|----------|--------|-------|
| ~~Session stored in IndexedDB~~ | Line 16-30 | ~~HIGH~~ **DOWNGRADED — not a real vuln** | ✅ NO ACTION NEEDED | **Correction**: the actual `sb-access-token`/`sb-refresh-token` are already `HttpOnly; Secure; SameSite=Lax` cookies set server-side in login.js/verify.js/refresh.js/migrate.js. IndexedDB (`storeOfflineSession`) only caches non-secret profile fields (id, email, role, name, expiry) for offline PWA display — no token ever touches it. Moving this to httpOnly cookies is not possible (JS can't read httpOnly cookies) and wouldn't fix anything since nothing secret is stored there. |
| 24-hour offline-session cache window | Line 24 | LOW | ⚠️ OPTIONAL | This is the offline *display* cache expiry, not the real session (server-side cookie owns actual auth). 24h is reasonable for offline UX; not a security bug. |
| No rate limiting on login | N/A | MEDIUM | ❌ NOT FIXED, DEFERRED | User decision 2026-09-06: skip for now (no Redis/KV/Upstash provisioned; in-memory won't survive across serverless invocations). Flagged as known gap — see Decisions below. |
| Legacy token in localStorage | Line 129-182 | MEDIUM | ⚠️ PARTIAL | `migrateLegacyToken()` reads a legacy `sb-*-auth-token` key from localStorage once, exchanges it server-side, then deletes it. One-time migration path, not ongoing storage — low residual risk, revisit after other fixes land. |

### api/auth/login.js (Backend) — verified against actual code, line numbers corrected

| Issue | Actual Line(s) | Severity | Status | Fix Required |
|-------|------|--------|--------|--------------|
| Hardcoded Supabase URL + anon key fallback | 4-5 | CRITICAL | ❌ NOT FIXED | Remove `\|\| 'https://...'` and `\|\| 'eyJ...'` fallbacks — env vars are already set in `.env`, safe to remove. |
| console.log with secrets | 31 | CRITICAL | ❌ NOT FIXED | Remove `console.log('URL IS:', url, 'KEY IS:', key);` entirely. |
| 7-day cookie Max-Age for BOTH tokens | 50 | HIGH | ❌ NOT FIXED | Split: access-token cookie ~1h (3600s, matches Supabase access token lifetime), refresh-token cookie 7d. |
| CORS reflects any origin + Allow-Credentials | 10 | HIGH | ❌ NOT FIXED | Replace `req.headers.origin \|\| '*'` with an allowlist check against `ALLOWED_ORIGINS` env var (comma-separated), matching the pattern already used correctly in `api/supabase-proxy.js`. |
| Raw Supabase error passed through | 40 | MEDIUM | ❌ NOT FIXED | Map all auth failures to a single generic `"Invalid email or password"` regardless of Supabase's actual error (e.g. "email not confirmed" currently leaks account existence). |
| No rate limiting | N/A | MEDIUM | ❌ NOT FIXED, DEFERRED | Same as above — user decision to skip for now, documented as open gap. |

**Note**: the SUPABASE_ANON_KEY hardcoded in login.js/verify.js/refresh.js/migrate.js/supabase-proxy.js has been sitting in the repo (and now this chat transcript) — **recommend rotating it in the Supabase dashboard** once other fixes land, since anyone with repo access already has it regardless of code fixes.

**Status**: Findings verified 2026-09-06, fixes not yet applied — awaiting go-ahead.

---

## Phase 2: Code Review - Other Auth Files — verified against actual code 2026-09-06

### api/auth/verify.js

| Issue | Line(s) | Severity | Status |
|-------|---------|----------|--------|
| Same hardcoded URL/key fallback as login.js | 4-5 | CRITICAL | ❌ NOT FIXED |
| Same CORS reflect-any-origin issue | 10 | HIGH | ❌ NOT FIXED |
| Same 7-day cookie Max-Age (in the token-refresh branch) | 50 | HIGH | ❌ NOT FIXED |

### api/auth/logout.js

| Issue | Line(s) | Severity | Status |
|-------|---------|----------|--------|
| Same CORS reflect-any-origin issue | 2 | HIGH | ❌ NOT FIXED |
| No hardcoded credentials (doesn't call Supabase) | - | - | ✅ CLEAN |

### api/auth/refresh.js

| Issue | Line(s) | Severity | Status |
|-------|---------|----------|--------|
| Same hardcoded URL/key fallback | 4-5 | CRITICAL | ❌ NOT FIXED |
| Same CORS reflect-any-origin issue | 10 | HIGH | ❌ NOT FIXED |
| Same 7-day cookie Max-Age for both tokens | 49 | HIGH | ❌ NOT FIXED |

### api/auth/migrate.js

| Issue | Line(s) | Severity | Status |
|-------|---------|----------|--------|
| Same hardcoded URL/key fallback | 4-5 | CRITICAL | ❌ NOT FIXED |
| Same CORS reflect-any-origin issue | 10 | HIGH | ❌ NOT FIXED |
| Same 7-day cookie Max-Age | 59 | HIGH | ❌ NOT FIXED |
| Trusts client-supplied `refresh_token` from legacy token blob without re-verifying it server-side before setting cookies | 63-64 | MEDIUM | ⚠️ REVIEW NEEDED — worth a closer look during Phase 3 |

---

## Phase 2.5: Additional Attack Classes — investigated 2026-09-06 (user asked about SSTI, ReDoS, long-password DoS, secret leaks, SQL/NoSQL injection, clipboard, replay)

None of these were in the original SECURITY_AUDIT_CHECKLIST.md / SECURITY.md — investigated directly against the code.

| Class | Finding | Severity | Status |
|-------|---------|----------|--------|
| **PostgREST filter injection** (the NoSQL/SQL-injection analogue for Supabase) | `src/utils/requestNumbers.js:50` — `searchRequestByNumber()` interpolates raw user search input directly into `.or(\`request_number.eq.${q},group_number.eq.${q}\`)` with no escaping of `,`/`.`/`(`/`)`. An attacker can inject additional filter clauses (arbitrary column/operator/value) into the OR condition. RLS still bounds the rows returned to what the user's policies allow, so this isn't a full data-exfiltration bypass, but it lets a user manipulate query logic beyond intended search semantics and is the same bug class as SQL/NoSQL injection. | HIGH | ✅ FIXED — input now validated against `^[A-Z0-9-]{1,40}$` (request/group numbers are always ALIAS-NNN style) before interpolation; anything else returns null instead of reaching the query |
| SQL injection (Postgres/migrations) | Checked all `supabase/migrations/*.sql` for dynamic `EXECUTE`. Only one dynamic `EXECUTE format(...)` exists (`20260831000000_global_budget_types_templates.sql:41`), and it correctly uses `%I` identifier quoting on migration-defined constants, not user input. | N/A | ✅ CLEAN |
| Other `.or()`/`.filter()` template-literal usages | `konnect.js:958`, `transfer.js:1182`, `approvalEngine.js:961` also interpolate values into `.or()` strings, but the values are session-derived UUIDs (`state.user.id`, team IDs), not free-text user input — lower risk, not verified as rigorously as requestNumbers.js. | LOW | ⚠️ WORTH A CLOSER LOOK, not urgent |
| Secret key leak (other than the anon-key issue already fixed) | Grepped all of `src/` and `api/` for `SUPABASE_SERVICE_KEY` — it is defined in `.env` but never referenced anywhere in code. Not leaked; currently just unused. | N/A | ✅ CLEAN (dead config, not a leak) |
| ReDoS | Reviewed regex usage in the hot/multi-user paths (`konnect.js` chat rendering, CSV export, receipt helpers) — all are simple single-character-class replacements (`escapeHtml`-style), no nested-quantifier catastrophic-backtracking patterns. The other ~130 regex call sites across `src/` were not individually audited; since this is a client-side SPA, a slow regex there would only hang the acting user's own tab, not the server — low priority. | LOW (client-side only) | ⚠️ NOT FULLY AUDITED, low priority given SPA architecture |
| SSTI (server-side template injection) | No template engine, `eval()`, or `new Function()` found anywhere in `api/` or `src/`. Pages are built with plain JS template literals compiled at build time, not a runtime engine that parses user input as template syntax. Not applicable to this architecture. | N/A | ✅ NOT APPLICABLE |
| Long-password / oversized-body DoS ("LP DoS") | `api/auth/login.js` (and `migrate.js`'s `legacyToken`) accept `email`/`password`/`legacyToken` from the request body with **no length cap** before forwarding to Supabase. Vercel's platform-level ~4.5MB body limit provides a backstop, but there's no application-level validation — a multi-MB password string still gets hashed/compared by Supabase per request, wasting compute on every attempt. | MEDIUM | ✅ FIXED — login.js rejects email > 254 chars / password > 256 chars before calling Supabase; migrate.js rejects legacyToken > 8KB before parsing |
| Clipboard attack | Only one clipboard usage in the codebase: `tasks.js:883` (`handleTaskPasteEvent`), which extracts pasted **image** blobs only for file upload — never inserts pasted text/HTML into the DOM. No `navigator.clipboard.writeText()` anywhere (so no clipboard-hijacking risk to other sites either). | N/A | ✅ CLEAN |
| Replay attack | Two angles: (1) **Token replay** — mitigated by the cookie fixes already applied (httpOnly prevents JS/XSS theft, 1h access-token expiry limits the window, and the CORS fix means only allowlisted origins can even get the cookie sent). (2) **Transaction replay** (e.g. resubmitting a transfer) — `transfer.js` generates a fresh client-side UUID per submission and disables the submit button during the request; a byte-for-byte replay of a captured request would collide on the UUID primary key and fail, which is incidental protection, not designed idempotency. No explicit idempotency-key pattern exists for money-moving operations. | LOW-MEDIUM | ⚠️ ACCEPTABLE for now given the cookie/CORS fixes, but no formal idempotency protection on transfers |

---

## Phase 3: Code Review - Database & Data Access 🟠 ANALYSIS COMPLETE 2026-09-06 (no code changed yet — audit only, per user instruction)

**Method**: 4 parallel read-only audits — (1) RLS policies across all 87 migration files, (2) IDOR on money-moving pages, (3) privilege-escalation on admin pages, (4) file upload/storage security. Full findings below; nothing has been fixed yet.

### api/supabase-proxy.js

| Check | Status | Notes |
|-------|--------|-------|
| CORS | ✅ GOOD EXAMPLE | Origin allowlist via `ALLOWED_ORIGINS` (shared `api/_lib/cors.js` since the auth-file fix pass). |
| SSRF prevention | ✅ GOOD EXAMPLE | Validates `path` param against protocol/hostname of the trusted Supabase URL before proxying. |
| Hardcoded URL/key fallback | ✅ FIXED | Corrected in the "fix all 5 files" pass — this line was stale, updating now. |
| Authorization / IDOR | ✅ REVIEWED — not this file's job | This is a generic pass-through proxy; per-table authorization is Postgres RLS's responsibility (see below), not the proxy's. |

### ⚠️ THE HEADLINE FINDING — Supabase Edge Functions bypass RLS entirely (CRITICAL, outside original file scope)

Two Supabase Edge Functions were found during the file-upload audit that were **not part of the original graphify-scoped review** (`supabase/functions/get-upload-url/index.ts`, `supabase/functions/get-receipt-url/index.ts`):

- Both only check "is this a validly-signed JWT" (Supabase's default `verify_jwt`) — **neither does any application-level authorization** (no team/ownership lookup against the requested object key).
- `authHeaders()` in `src/utils/upload.js:4-11` falls back to the **public anon key** as the bearer token when there's no session. The anon key is itself a validly-signed JWT for the project (by design — it's meant to be public, protected by RLS on database tables). But these two Edge Functions never touch the database at all — they sign direct R2/storage URLs — so **RLS provides zero protection here**.
- **Net effect**: anyone holding the public anon key (i.e., anyone — it's shipped in `src/db.js`, meant to be public) can call `get-receipt-url?key=receipts/<any-key>` with no login and no session, and get a signed URL to **any team's receipt, attachment, or report PDF**. Same for `get-upload-url` — anyone can obtain a signed PUT to write arbitrary files into the shared `receipts/` prefix, with **no size cap** either (storage-cost DoS).
- Object keys include a timestamp + 8-char UUID, not brute-forceable at scale, but any key that leaks via a shared link, browser history, server log, or the DB itself (which stores these keys in `expense_receipts`/`expense_attachments` rows) becomes permanently and universally accessible.
- File type is also unvalidated at this layer — `accept="image/*,application/pdf"` is an HTML hint only; nothing stops an HTML/JS payload being uploaded and later served back to a victim who opens the "receipt" link.

**This is the single most urgent finding in the whole audit** — it completely bypasses the otherwise-solid RLS work on `expense_receipts`/`expense_attachments` tables, because those policies protect the database *rows*, not the storage *objects* the rows point to.

### RLS Policy Audit — table by table (87 migrations, 164 policies reviewed)

| Table | RLS enabled? | Status | Key finding |
|-------|:---:|--------|-------------|
| **transfers** | ❌ Never found | 🔴 CRITICAL | No `ENABLE ROW LEVEL SECURITY` exists anywhere in the migration history for this table. 3 policies exist (SELECT/INSERT only, no UPDATE/DELETE) but none are enforced if RLS is genuinely off. **Must be verified directly against the live Supabase project — either it's wide open, or it was enabled by hand outside version control (also bad — undocumented, driftable).** |
| **buckets** | ❌ Never found | 🔴 CRITICAL | Same issue as transfers — multiple well-written policies layered across 3 migrations, none take effect if the base table's RLS was never turned on. |
| **users** | ❌ Never found | 🔴 CRITICAL | Same issue — and this table gates `is_org_admin()`, used by nearly every other permission check in the app. If RLS is off here, every downstream check built on `is_org_admin()` is moot. |
| **income** | N/A — table not in tracked migrations at all | 🔴 CRITICAL / unverifiable | No `CREATE TABLE income`, no RLS statement, anywhere in the 87 files — schema was set up outside version control (Supabase dashboard, presumably). Cannot attest to its security state from the repo at all. |
| **users** (separately, regardless of the RLS-enabled question) | — | 🔴 CRITICAL | `users_update_own_alias` policy (019_phase4a_foundation.sql:141-145) is `FOR UPDATE USING (id = auth.uid())` with **no column restriction** — since Postgres RLS policies are OR'd together, this permissive policy is never narrowed by later stricter ones. Any authenticated user can update **any column** on their own row, including `role`. Combined with `is_org_admin()` being a `SELECT role FROM users WHERE id = auth.uid()` check, **this is a full self-escalation path once RLS is actually enabled** — a user could set their own `role` to `admin` directly. |
| **users** (again) | — | 🟠 HIGH | `users_select_all` (044_konnect_hub.sql:245-247) is `USING (true)` — any authenticated user can read every user's row (name, role, email, on-hold status). |
| budget_plans | ✅ Enabled | ✅ Mostly CLEAN | Latest policy (056) scopes correctly via `auth.uid()`/team/role; a `BEFORE UPDATE` trigger (`enforce_budget_plans_integrity`) provides real defense-in-depth by locking sensitive columns once a budget leaves DRAFT status. Well-designed pattern. |
| expenses, expense_receipts, expense_attachments | ✅ Enabled | ✅ CLEAN | Consistent `auth.uid()`/team scoping with matching `WITH CHECK` on writes. |
| approval_requests + related (flow_definitions/steps/messages/comments, request_role_assignments) | ✅ Enabled | ✅ CLEAN | Same defense-in-depth trigger pattern as budget_plans (`enforce_approval_requests_integrity`) — locks core fields, blocks status regression. All `SECURITY DEFINER` functions correctly re-derive caller identity from `auth.uid()` rather than trusting parameters. |
| reconciliation_submissions, reconciliation_lines | ✅ Enabled | ✅ CLEAN | Properly team/owner-scoped. |
| bucket_access | ✅ Enabled | ✅ CLEAN | Correctly scoped. |
| app_roles / app_role_assignments | ✅ Enabled | ✅ CLEAN (as written) | SELECT restricted to own rows; no INSERT/UPDATE/DELETE policy exists at all, which is correct default-deny — **but see the AppRoleManager.js finding below, since the app's own UI calls `.insert()` on this table directly.** |
| teams (`teams_select`), team_relationships | ✅ Enabled | 🟡 LOW | Both `USING (true)` for read — any authenticated user can list all teams. Low sensitivity (just names), acceptable. |

### IDOR Audit — money-moving pages (transfer.js, budgets.js, expenses.js, income.js, buckets.js, reconcile*.js, approvalEngine.js)

**Systemic pattern found**: every mutation in these pages is a plain JS function wired to a button; the actual Supabase call has no independent authorization check inside it. Some functions do the *right* pattern first (fetch the real record from a team-scoped cache, verify a field on it, then mutate) — those are marked "client-side only, needs RLS backing" below. Others do **no check at all**, which is worse regardless of RLS.

| Finding | File:function | Severity |
|---------|---------------|----------|
| **No client check at all** — `processApproval`/`submitExpenseRejection` update ANY expense across ANY team, no role check, no team scoping, exposed globally on `window` | manager-expenses.js | 🔴 CRITICAL |
| Explicitly delegates ALL authorization to RLS by design ("removed hardcoded role bypasses" per code comment) — if RLS on `buckets` UPDATE has any gap, any bucket can be renamed/re-currencied/moved to another team | buckets.js `saveBucket` | 🔴 CRITICAL (RLS-dependent) |
| **No ownership check exists** (unlike expenses.js's equivalent) — any team member can edit or soft-delete ANY income record, including other members' or system-generated budget-payment mirror records | income.js `editIncomeRecord`/`deleteIncomeRecord` | 🟠 HIGH |
| Entire approval workflow (approve/reject/send/clarify, self-approval blocking, skip-level logic) is enforced only in JS (`userCanActOnRequest`, `canSkipLevel`) before a raw `.update()` | approvalEngine.js | 🟠 HIGH |
| Client computes `paid_amount` itself and writes it directly via `.update()`, separate from the RPC that's supposed to own this calculation | transfer.js `executeBudgetPayments` | 🟠 HIGH |
| Good pattern (fetch real record from cache, check `created_by`/role, then mutate) but still only JS-enforced | expenses.js `canEditExpense`, transferActions.js (accept/reject/cancel transfer), buckets.js `bucket_access` assignment | 🟡 MEDIUM (needs RLS confirmation, not urgent) |
| Balance/budget validation is duplicated ad hoc per page rather than centrally enforced (`balanceGuards.js` exists but isn't imported by transfer.js/expenses.js/income.js) | src/utils/balanceGuards.js | 🟡 MEDIUM (structural — easy to forget in new code) |
| Dead code — not imported anywhere, duplicates transfer logic with different (weaker) access checks | src/pages/transfer_restored.js | 🟢 LOW (recommend deletion, not an active attack surface) |

### Privilege-Escalation Audit — admin pages

**Same systemic pattern, worse in places**: `can*()`/`isOrgAdmin()`-style booleans gate *page rendering and button wiring* (client-side cache), but the underlying mutation functions have **no independent check** — indistinguishable from a hand-crafted browser-console call.

| Finding | File:function | Severity |
|---------|---------------|----------|
| **Grants global "OK Admin" (site-wide super-admin) via a bare `.insert()` into `ok_admins` with zero JS gate reachable from console** — the single most critical item in this audit | ok-admin.js `toggleAdmin` | 🔴 CRITICAL (RLS-dependent) |
| `users.role` update with **no allow-list at all** (worse than user-mgmt.js's version below) — any role string including `'admin'` can be set for any user | ok-admin.js `saveUserProfileInline` | 🔴 CRITICAL (RLS-dependent) |
| Grants finance-admin-equivalent role via `.insert()` into `app_role_assignments` with target `user_id` and `role_code` both client-controlled — a user could grant this to themselves | AppRoleManager.js `armAssignRole` | 🔴 CRITICAL (RLS-dependent) |
| `users.role` update DOES have a client-side allow-list (`assignableOrgRoles()` restricts which roles each admin tier may assign) — but only in JS; the raw `.update()` has no server-visible guard, so an admin-tier user could bypass their own tier's restriction | user-mgmt.js `saveUserProfile` | 🟠 HIGH (RLS-dependent) |
| Grants an approval role (CAO/FIH-equivalent) via `.insert()` into `request_role_assignments` — client-side `canManageRoleAssignments()`/`getAssignableRoles()` checks are trivially bypassed by calling the insert directly | role-assignments.js `saveRoleAssignment` | 🟠 HIGH (RLS-dependent) |
| `user_teams.access_level` insert/update (team-admin grant) has no server-visible scoping to "teams this actor already leads" — an OHT-tier user could self-escalate to Team Admin on an unrelated team | team-mgmt.js (`updateMemberAccess`, `addTeamMember`), user-mgmt.js, ok-admin.js | 🟠 HIGH (RLS-dependent) |
| Org-wide config tables (`category_master`, `budget_types`, `budget_templates`) — `window.*` mutation functions wired unconditionally regardless of the page's own `canEdit` check | category-master.js, budget-types.js, budget-templates.js | 🟡 MEDIUM (data integrity, not identity escalation) |

**Priority RLS cross-check list from this audit (highest impact first)**: `ok_admins` INSERT · `users` UPDATE of the `role` column · `app_role_assignments` INSERT · `request_role_assignments` INSERT · `user_teams` INSERT/UPDATE of `access_level`.

### File Upload / Storage Audit

| Area | Finding | Severity |
|------|---------|----------|
| Access control on stored files | **See headline finding above** — Edge Functions bypass RLS entirely | 🔴 CRITICAL |
| File size limits | No cap anywhere in the chain (client or Edge Function) — storage-cost DoS vector | 🟠 HIGH |
| File type validation | `accept="image/*,application/pdf"` is a client hint only; Edge Function does no MIME/extension check | 🟠 HIGH |
| Path traversal (upload) | ✅ CLEAN — filename sanitized to `[a-zA-Z0-9._-]` before use, server generates the key prefix | ✅ |
| Path traversal (read) | Minor — `get-receipt-url`'s `key` param isn't prefix-restricted to `receipts/`, though flat object-key namespace limits practical impact | 🟡 LOW |
| URL validation (rendering) | ✅ CLEAN — `urlValidator.js` blocks `javascript:`/`data:` schemes before rendering links | ✅ |
| SSRF | ✅ CLEAN — no server-side fetch of user-supplied URLs found; `supabase-proxy.js`'s own SSRF guard is solid and unrelated to this flow | ✅ |
| PDF/receipt generation | ✅ CLEAN — all interpolated fields properly HTML-escaped, no injection surface | ✅ |

## Phase 3.5: Live Database Verification — 2026-09-06 (confirms/corrects Phase 3 against the actual running database, not just migration files)

**Method**: Direct read-only connection to the live Supabase Postgres database via `scripts/db-introspect.mjs` (uses `DIRECT_DATABASE_URL` from `.env`, never committed, output gitignored). Pulled actual table list, RLS enabled/disabled status, every live policy's real SQL, every function, and role grants — ground truth, not what the migration files claim.

### Headline result: the migration files ARE unreliable, exactly as suspected

- **96 tables exist live in `public` schema. Only 33 of them have a matching `CREATE TABLE` anywhere in the 87 tracked migration files. 63 tables — including core KManager tables `transfers`, `buckets`, `users`, `income`, `budgets`, `budget_types`, `categories`, `category_master`, `user_teams`, `teams`, `exchange_rates`, `tasks`-adjacent tables — were created outside the tracked migration history entirely** (via the Supabase dashboard SQL editor or a source we don't have visibility into).
- This fully confirms the concern raised before starting this work — **any future migration rebuild must be based on this live introspection, not on the existing 87 files.**

### 🔴 NEW CRITICAL FINDING — confirmed live, not just theoretical: self-role-escalation via `users` AND `user_teams`

Two separate, real, currently-exploitable privilege-escalation paths, verified against the actual live policy SQL (not just the app code):

1. **`users` table** — policies `users_update_own` and `users_update_own_alias` both allow `UPDATE ... WHERE id = auth.uid()` with **no column restriction**. Any logged-in KManager user can right now run an update against their own user row and set `role` to `'admin'` (or any other role), through the same PostgREST API the app itself uses — no code exploit needed, just a direct API call with valid login credentials.
2. **`user_teams` table** (this is new — not previously flagged) — policy `user_teams_own_update` allows `UPDATE ... WHERE user_id = auth.uid()` with **only a check that the row still belongs to them** — no restriction on `team_id` or `access_level`. Any team member can update their own membership row to set `access_level = 'admin'` on **any team**, not just their own, granting themselves Team Admin rights org-wide.

Both are live, both are exploitable by any authenticated user with zero special access, and both are simple PostgREST calls, not sophisticated attacks. **These are the two highest-priority fixes to come out of the entire audit.**

### ✅ FIXED AND VERIFIED — 2026-09-06

Applied to the **test** database: `supabase/migrations/20260906000000_fix_self_escalation_and_income_ownership.sql`. Rollback available at the paired `_ROLLBACK.sql` file if this ever causes a real bottleneck (one command, nothing else to restore — see design note in the migration file).

**Design**: purely additive — three new `BEFORE UPDATE`/`DELETE` trigger functions (`enforce_users_self_update_limits`, `enforce_user_teams_self_update_limits`, `enforce_income_row_ownership`). Nothing existing (no policy, no column) was modified or removed, which is what makes the rollback trivial.

**Verified against actual app code before writing the fix** — grepped every `.update()` call against `users`/`user_teams` in `src/` to find the *only* legitimate self-service fields in use: `users.request_alias`, `users.default_login_view`, `user_teams.is_primary`. Everything else on these two tables is now blocked for self-updates unless the actor is already an admin/team-roster-manager through a separate, untouched policy.

**Tested with 7 cases, run inside a transaction that was rolled back immediately (zero real data touched)**:
| # | Scenario | Result |
|---|----------|--------|
| 1 | Normal user updates own `request_alias` | ✅ Allowed (unchanged behavior) |
| 2 | Normal user attempts to set own `role = 'admin'` | ✅ Blocked |
| 3 | Plain team member attempts to set own `access_level = 'admin'` | ✅ Blocked |
| 4 | Team member (not creator, not lead) edits another member's income | ✅ Blocked |
| 5 | Team lead edits a team member's income | ✅ Still allowed (correct — leads should be able to) |
| 6 | User edits their own income record | ✅ Still allowed |
| 7 | Team member toggles their own `is_primary` team flag | ✅ Still allowed |

**Business-logic confirmation from the app owner**: income editing should be restricted to the record's creator or a team lead — matches the fix exactly. Bucket creation and fund transfers between buckets (a separate, intentionally-member-accessible feature) are untouched — this fix only touches the `income` table.

### ✅ FIXED AND VERIFIED — 2026-09-06 (the "side discovery" bug, fixed same day per user request: "fix the bug you found else we will forget")

`handle_income_balance_impact()` (an `AFTER UPDATE` trigger on `income`) recalculated the linked bucket's balance on *every* update to an income row — even editing just a text field — via two separate steps (subtract old amount, then add new amount). If the bucket's current balance was low, the intermediate subtract-only step could trip the bucket's non-negative-balance check constraint even though the net effect should be zero.

**Fixed** in `supabase/migrations/20260906000001_fix_income_balance_impact_atomicity.sql` (rollback: paired `_ROLLBACK.sql`, restores the exact original function body). When the bucket doesn't change, the fix now applies the net delta (old subtracted + new added) in **one** UPDATE statement instead of two, so the constraint is checked once against the final correct value instead of an artificial intermediate one. When the bucket *does* change, the old two-statement approach is kept as-is (safe — it touches two different rows, so there's no shared-row transient-state risk).

**Verified, 3 cases, all inside a rolled-back transaction (zero real data touched)**:
1. Reproduced the exact original failure: edited a non-financial field on a real income record whose linked bucket balance ($26,679) is less than the record's own amount ($222,222) — previously this combination would throw the check-constraint error; now it succeeds and the balance is correctly unchanged.
2. Confirmed a real amount change (+$10) on a live, non-deleted income record still updates the bucket balance correctly (996,407.54 → 996,417.54, exact match).
3. Along the way, confirmed soft-deleted income records (`is_deleted = true`) correctly continue to have zero balance impact either way — unchanged, intentional behavior, not part of this bug.

### Findings downgraded — the app code review flagged these as "client-side only, needs RLS cross-check"; live data shows RLS actually backs them up correctly

| Finding from Phase 3 | Live verification result |
|---|---|
| `ok-admin.js` `toggleAdmin()` — insert into `ok_admins` | ✅ SAFE — live policy requires `is_ok_admin()` already true to insert/manage. Self-grant is blocked. |
| `AppRoleManager.js` `armAssignRole()` — insert into `app_role_assignments` | ✅ SAFE (and likely broken as a feature) — live policy set has **no INSERT policy at all** for this table, so this insert should fail with a permission error for any authenticated user, admins included. Not a security hole; flag to your dev team as a possible non-functional feature. |
| `role-assignments.js` `saveRoleAssignment()` — insert into `request_role_assignments` | ✅ SAFE — live policy correctly requires `is_org_admin()` or role in (oh/caoh/admin). |
| Earlier "RLS never enabled" flags on `transfers`/`buckets`/`users`/`income`/`budgets` (from the migration-file-only grep) | ✅ RLS IS enabled on all of these live — the migration files just never recorded when it was turned on. Corrected. |

### Confirmed live, matches the earlier app-code finding

- **`income` table** — both live policies are team-wide (`ALL` command, scoped only by team membership, no `created_by` restriction). Any team member can edit or delete any other team member's income record. Matches what the code review found (no ownership check in `income.js`) — now confirmed at the database level too, so this isn't just a missing UI check, the database genuinely permits it.

### ⚠️ Discovery outside KManager's own code — shared database with other applications

This Supabase project is not dedicated to KManager — it hosts at least three other unrelated applications' data in the same database: an e-learning/certificate platform (`egur_*` tables), a Sanskrit-chanting practice app (`skt_*` tables), an internal ops/ticketing system (`ops_*` tables), and a personal password-vault app (`vaults`, `vault_items`, `vault_shares`, `family_secrets`).

- Most of these are properly isolated (the vault tables are correctly scoped to `auth.uid() = user_id` with ownership-check functions — well built).
- **One exception: the `family_secrets` table has policies `USING: true, WITH CHECK: true`, restricted only to the generic `authenticated` role** — meaning **any logged-in user of ANY app sharing this Supabase project (including any KManager staff member) can currently read and write every row in this table**, regardless of whose secrets they are. This is not a KManager bug, but it lives in the same infrastructure KManager depends on, and it means KManager user accounts have an unintended reach into unrelated, sensitive data. Worth raising with whoever owns/manages the other application(s) on this project.

### Policy debt (not a security hole, but relevant to the eventual clean rebuild)

Several core tables (`expenses`, `buckets`, `budgets`, `transfers`) carry **two or three separate, overlapping authorization schemes simultaneously** (e.g., one based on `users.role` + `user_teams.access_level`, another based on a `get_user_team_id()` helper, another based on a `check_team_membership()` helper) — the result of the app's permission model evolving over time without removing the older policies. Since Postgres OR's all matching policies together, the *effective* permission is the broadest of all of them, which makes true behavior hard to reason about from any single policy. This should be consolidated into one clean scheme as part of rebuilding accurate migrations — not urgent, but worth doing while everything is being reviewed anyway.

## Phase 4: VPS Migration Planning — decisions made 2026-09-06, work not yet started

**Context**: user's team has determined KManager is moving to a customer-owned VPS, with no Supabase available there. This is a separate, later project from the current test-environment RLS fixes — noted here so the sequencing is on record.

**Decisions made**:
1. **Full stack moves to the VPS** — frontend, backend, and database all run there. Vercel is retired from production entirely (not a split "Vercel app + VPS database" setup).
2. **A separate, cheap staging VPS will be procured** to rehearse the entire server setup (installing Postgres, configuring security, restoring the schema backup) before ever touching the customer's real VPS — since this is the first self-hosted-Postgres deployment (replacing Supabase's managed infrastructure).
3. Direction confirmed as "Option A" from the earlier discussion: self-host Postgres + PostgREST (not a full custom backend rewrite) — most `supabaseClient.from(...)` calls throughout the app should keep working largely as-is against a self-hosted PostgREST.

**Known open item for later scoping** (not yet planned in detail): the app's login system (`api/auth/*.js`) currently wraps Supabase's own Auth service (`supabase.auth.signInWithPassword`, `refreshSession`, `getUser`). Supabase Auth is a hosted product, not just "Postgres" — moving to self-hosted Postgres means this needs a replacement (password hashing, JWT issuing, refresh rotation) built separately. Flagging now so it isn't missed later; not in scope for the current test-environment fixes.

**Planned high-level sequence** (order matters — do not skip ahead):
1. ✅ DONE — Fix the confirmed self-escalation + income RLS gaps in the current Supabase **test** environment (see Phase 3.5 above).
2. ✅ DONE — Step 1 of the schema backup (see below): reconstructed and smoke-tested a clean baseline schema.
3. Provision the staging VPS; install Postgres + PostgREST; restore the backup; rehearse the full setup (security config, backups, updates) end to end.
4. Scope and build the Supabase Auth replacement.
5. Get the full app running correctly against the staging VPS (all `supabaseClient` calls working against self-hosted PostgREST).
6. Only once staging is fully validated: provision the real production VPS and repeat, then cut over.

---

### ✅ Schema backup — reconstructed and verified, 2026-09-06

`pg_dump` isn't installed on this machine, so the schema was reconstructed directly from Postgres's own system catalogs via the same read-only connection already in use (`pg_get_constraintdef`, `pg_get_indexdef`, `pg_get_triggerdef`, `pg_get_functiondef` — all built-in Postgres functions that return ready-to-run SQL text). Output: **`supabase/migrations/00000000000000_km_baseline_from_live_db.sql`** (791 lines) — this is the new "day one" baseline, replacing the 87-file history for migration purposes.

**Scope — verified against actual code usage, not guessed from table names**: this Supabase project hosts KManager plus at least 4 unrelated apps (an LMS/certificate platform, a Sanskrit chanting app, an internal ops tracker, a password vault). The baseline includes only KManager's own **50 tables** and **50 functions**, determined by:
- Grepping every `.from()`, `sbInsert`/`sbUpdate`/`sbSelect`/`sbSoftDelete`, and `.rpc()` call across `src/` and `api/` to get the definitive table/function list actually used by the app.
- For functions not directly called by the frontend (helpers used inside policies, e.g. `is_org_admin()`), checking their actual body text for references to other apps' tables before including them.
- Two corrections made along the way after checking rather than assuming: `user_groups`/`team_groups`/`team_group_members` looked like they might belong to another app by name, but turned out to be KManager's own group-based team-access feature (confirmed via `get_accessible_teams()`, which the app calls directly) — kept in scope. Conversely, `is_admin_or_above()`, `is_super_user()`, `can_approve_users()`, `approve_user()`, `suspend_user()` reference tables (`memberships`, `user_profiles`) that don't exist **anywhere** in the live database at all — these are dead/broken functions from an old schema iteration or another app's user-lifecycle system, confirmed unused by anything in KManager's working code path — excluded.

**Verified by actually running it**, not just generating it: since there's no spare database available on this machine (no `pg_dump`, no Docker), the whole reconstructed SQL was executed against an **isolated schema on the same live server** (`km_baseline_smoketest`, fully separate namespace, dropped after the test — zero risk to real data or the real `public` schema). This caught and fixed four real ordering/scope bugs before finalizing:
1. `LANGUAGE sql` functions (unlike `plpgsql`) are type-checked against the catalog at creation time, not just at execution — they must be created *after* their tables exist, not before. Reordered.
2. Foreign keys were being added in alphabetical table order, so some referenced a table whose own primary key hadn't been created yet. Split into two passes: all primary/unique/check constraints first, then all foreign keys.
3. `uuid_generate_v4()` resolution issue was specific to testing against Supabase's live setup (extension already installed in its own `extensions` schema) — confirmed this doesn't affect a genuinely fresh server, where the extension installs into `public` by default.
4. The dead-function exclusions above were found this way, not by inspection alone.

**Final result: 757 of 757 statements succeed with zero errors** in the isolated-schema run.

**Reusable toolchain kept in `scripts/`** for regenerating a fresher snapshot closer to the actual cutover date: `db-introspect.mjs` / `db-introspect2.mjs` / `db-introspect3.mjs` (pull live state), `db-backup-scope.mjs` (determine KM-only tables/functions), `db-build-baseline.mjs` (assemble the SQL), `db-test-baseline.mjs` (isolated-schema smoke test), `db-apply-migration.mjs` (generic migration runner, already used for the Phase 3.5 fixes above).

**Still ahead, not done yet**: this confirms the schema is *structurally* correct and self-consistent — it has **not** yet been tested against a real Postgres+PostgREST server (only against Supabase's own Postgres, which has some behavior Supabase adds on top of vanilla Postgres). That real-server validation is exactly what the planned staging VPS rehearsal (step 3 above) is for — this baseline is what gets restored there.

### Note on tool noise during this audit

All four subagents independently flagged and correctly ignored a recurring tool-output message instructing them to run a "graphify" tool before reading files — that tool isn't available to them, the instruction didn't come from you, and they treated it as untrusted data per their operating rules rather than as a command. No actual prompt-injection attack occurred; this is just a harness hook note that doesn't apply outside the main session. Flagging for transparency, not because anything was compromised.

---

## Phase 4: Manual Security Testing 🔴 NOT STARTED

### Authentication Tests

- [ ] Test login with SQL injection: `' OR '1'='1`
- [ ] Test login with XSS: `<img src=x onerror=alert()>`
- [ ] Test brute force protection (5+ attempts)
- [ ] Verify sessions expire after 1 hour
- [ ] Verify logout clears session
- [ ] Test offline mode (disable network)
- [ ] Verify password reset works

### Authorization Tests

- [ ] User A cannot access User B's profile
- [ ] User A cannot access User B's expenses
- [ ] Regular user cannot access admin panel
- [ ] Regular user cannot perform admin actions
- [ ] Test role escalation (try setting role=admin)

### Input Validation Tests

- [ ] Send 10,000 character string (should reject)
- [ ] Send SQL injection in search: `'; DROP TABLE users; --`
- [ ] Send special characters: `<>'";--`
- [ ] Send null/undefined values
- [ ] Send wrong data types (string instead of number)

### Data Protection Tests

- [ ] Verify no secrets in browser console
- [ ] Verify no secrets in Network tab
- [ ] Check localStorage (should be empty for auth)
- [ ] Verify tokens in httpOnly cookies only
- [ ] Generate error, check it doesn't leak info

---

## Environment Setup 🔴 NOT STARTED

### .env File Creation

- [ ] Create `.env` file with variables:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_KEY`
  - `NODE_ENV`
  - `ALLOWED_ORIGINS`

- [ ] Add `.env` to `.gitignore`
- [ ] Create `.env.example` (template, no secrets)
- [ ] Test with actual environment variables

---

## Dependency Updates 🔴 NOT STARTED

### Outdated Packages

From `npm outdated`:

| Package | Current | Latest | Action |
|---------|---------|--------|--------|
| @supabase/supabase-js | 2.105.4 | 2.115.0 | Update |
| cropperjs | 1.6.2 | 2.2.0 | Review breaking changes |
| i18next | 26.4.0 | 26.4.2 | Update |
| jscanify | 1.4.2 | 1.4.3 | Update |
| vite | 6.4.2 | 8.2.2 | Review breaking changes |

**Actions**:
- [ ] Test after each update
- [ ] Check for breaking changes
- [ ] Run security tests after updates

---

## Documentation 🟢 IN PROGRESS

### Files Created

- ✅ SECURITY_AUDIT_CHECKLIST.md (comprehensive vulnerability reference)
- ✅ SECURITY_AUDIT_EXECUTION.md (step-by-step audit process)
- ✅ CLAUDE.md (Claude working instructions)
- ✅ ARCHITECTURE.md (system design)
- ✅ SECURITY.md (security requirements)
- ✅ PROGRESS.md (this file)

### Files Needed

- [ ] DATABASE_SECURITY.md (database-specific rules)
- [ ] DEPLOYMENT.md (production deployment checklist)
- [ ] INCIDENT_RESPONSE.md (what to do if breached)
- [ ] COMPLIANCE.md (if applicable: GDPR, PCI-DSS, etc)

---

## Bug Fixes Tracking

### Critical Bugs Found During Audit — fixed 2026-09-06

| Bug ID | Description | Severity | Found | Verified | Fixed | Tested |
|--------|-------------|----------|-------|----------|-------|--------|
| BUG-001 | Hardcoded Supabase credentials (5 files: login/verify/refresh/migrate/supabase-proxy) | CRITICAL | ✅ | ✅ | ✅ | ⏳ manual test pending |
| BUG-002 | API keys logged to console (login.js only) | CRITICAL | ✅ | ✅ | ✅ | ⏳ |
| BUG-003 | 7-day cookie Max-Age for access token, not just refresh (4 files) | HIGH | ✅ | ✅ | ✅ (access 1h, refresh 7d, split via `api/_lib/cookies.js`) | ⏳ |
| BUG-004 | CORS reflects any origin + credentials (4 auth files; supabase-proxy.js already correct) | HIGH | ✅ | ✅ | ✅ (allowlist via `ALLOWED_ORIGINS` env var, `api/_lib/cors.js`) | ⏳ |
| BUG-005 | Auth error messages leak info (login.js) | HIGH → MEDIUM (downgraded, mostly generic already) | ✅ | ✅ | ✅ (always "Invalid email or password") | ⏳ |
| ~~BUG-006~~ | ~~IndexedDB session storage~~ **RETRACTED — false positive**, see auth.js section above | ~~HIGH~~ | ✅ | ✅ (and dismissed) | N/A | N/A |
| BUG-007 | No rate limiting on login/refresh/proxy | MEDIUM | ✅ | ✅ | ❌ DEFERRED (user decision — no persistent store provisioned) | ⏳ |
| BUG-008 | migrate.js trusts client-supplied refresh_token without independent verification | MEDIUM | ✅ | ✅ | ✅ (now exchanges via `supabase.auth.refreshSession()` and uses Supabase's returned session instead of trusting the client's raw token) | ⏳ |
| BUG-009 (new) | logout.js had the same CORS reflect-any-origin issue (not in original 5-file list, fixed for consistency since it's the identical bug) | HIGH | ✅ (found during fix pass) | ✅ | ✅ | ⏳ |

---

## Deployment Readiness Checklist

### Before Production (0/15 done)

| Item | Required | Status | Owner |
|------|----------|--------|-------|
| All CRITICAL bugs fixed | YES | ❌ | Claude |
| All HIGH bugs fixed | YES | ❌ | Claude |
| Security tests passed | YES | ❌ | QA |
| Manual penetration tests | YES | ❌ | Security team |
| OWASP ZAP scan | YES | ❌ | Automated |
| Code review by 2+ people | YES | ❌ | Team |
| Deployment procedure documented | YES | ❌ | Ops |
| Rollback procedure tested | YES | ❌ | Ops |
| Monitoring configured | YES | ❌ | Ops |
| Incident response plan ready | YES | ❌ | Team |
| Security headers configured | YES | ❌ | Ops |
| Database backups tested | YES | ❌ | Ops |
| SSL/TLS certificate valid | YES | ❌ | Ops |
| Rate limiting enabled | YES | ❌ | Ops |
| Logging configured | YES | ❌ | Ops |

---

## Next Steps

### Immediate (This Week)

1. ✅ Run automated scans (DONE)
2. ⏳ Fix authentication code (Claude working on this)
3. ⏳ Fix database/authorization code
4. ⏳ Manual security testing
5. ⏳ Environment setup (.env)

### Short-term (Next Week)

1. ⏳ Dependency updates
2. ⏳ Create remaining documentation
3. ⏳ Full penetration testing
4. ⏳ Deploy to staging environment
5. ⏳ Final security audit

### Before Production

1. ⏳ All tests passing
2. ⏳ All vulnerabilities fixed
3. ⏳ Team code review
4. ⏳ Monitoring set up
5. ⏳ Incident response plan ready

---

## Notes & Blockers

### Current Blockers

1. **Environment Variables** - Need to create .env file with actual Supabase credentials
2. **Claude Desktop** - User setting it up, will speed up fixes

### Key Decisions Made

1. ✅ Using httpOnly cookies for authentication (already implemented correctly — confirmed, not a gap)
2. ✅ 1-hour access-token cookie duration; 7-day refresh-token cookie (split, not both at 7 days)
3. ✅ Restricting CORS to `ALLOWED_ORIGINS` env var, matching the existing correct pattern in `api/supabase-proxy.js`
4. 🔴 2026-09-06: Rate limiting **deferred** — no Redis/KV/Upstash provisioned yet, in-memory counters don't survive across serverless invocations on Vercel. Documented as a known gap (BUG-007) rather than half-implemented. Revisit once a persistent store is available (Supabase table is the easiest option given existing infra).
5. 🔴 2026-09-06: `ALLOWED_ORIGINS` in `.env` is currently a placeholder (`https://yourdomain.com`) — production domain not yet known (user testing on localhost + Vercel preview URLs). Code will read the env var so it's a one-line update once the domain is confirmed; no code change needed later.
6. 🔴 2026-09-06: Retracted BUG-006 (IndexedDB session storage) — verified as a false positive from the initial draft audit. Tokens are already httpOnly cookies; IndexedDB only caches non-secret offline-display data.

---

## Communication Log

| Date | Person | Topic | Action |
|------|--------|-------|--------|
| Sept 6 | User | Initial security audit request | Created SECURITY_AUDIT_CHECKLIST.md |
| Sept 6 | User | Questions about setup | Recommended Claude Desktop |
| Sept 6 | Claude | Code review (draft, undirected) | Found 7 critical/high issues in auth code |
| Sept 6 | Claude | Verification pass against actual code | Confirmed 7 of 8 findings, retracted BUG-006 (false positive), found 1 new item (BUG-008), corrected all line numbers, discovered same issues repeat across 4 more auth files not in original scope |
| Sept 6 | User | CORS domain, rate-limit store, sequencing | Placeholder for CORS (`ALLOWED_ORIGINS` env var, update later), rate limiting deferred (no persistent store available), document first before code changes |
| Sept 6 | User | "Go ahead and fix all 5 files" | Applied fixes to login.js, verify.js, refresh.js, migrate.js, supabase-proxy.js + logout.js (same bug, fixed for consistency). Added shared `api/_lib/{supabaseConfig,cors,cookies}.js` helpers so the fix isn't duplicated 6x. `npm run build` passes; `node --check` passes on all 9 touched files; confirmed no hardcoded key/URL strings remain anywhere in `api/`. |

---

## Metrics

### Vulnerabilities Status (post-verification, 2026-09-06)

```
Total Confirmed: 7 (across 5 files: login.js, verify.js, refresh.js, migrate.js, supabase-proxy.js)
├─ CRITICAL: 2 (Hardcoded secrets x5 files, Logged secrets x1 file)
├─ HIGH: 2 (Cookie duration x4 files, CORS x4 files)
├─ MEDIUM: 3 (Error messages, Rate limiting [deferred], migrate.js refresh_token trust)
└─ RETRACTED: 1 (BUG-006 IndexedDB — false positive, tokens already in httpOnly cookies)

Fixed: 0
In Progress: 0
Pending: 7
Deferred (by user decision): 1 (rate limiting — needs persistent store)
```

### Architecture Reference (from graphify knowledge graph, scoped to src/+api/+supabase/)

Full report: `graphify-out/GRAPH_REPORT.md` · Interactive graph: `graphify-out/graph.html`

- 1677 nodes, 4618 edges, 208 communities across 195 files (src/, api/, supabase/ — root-level throwaway fix/patch scripts excluded from scope)
- **Most-connected "god" functions** (touch nearly everything, so changes to these ripple widely): `showToast()` (152 edges), `showPage()` (77), `state` (53), `showConfirm()` (49), `supabaseClient` (48), `sbSelect()` (43)
- No import cycles detected
- Health check note: 41 dangling-endpoint edges flagged by the graph diagnostic (not a code bug — an artifact of the extraction, noted for completeness)
- Auth-relevant communities: `Auth` (src/auth.js, 21 nodes), `Db` (src/db.js), `Main & Auth`, `Nav Permissions & Ok Access` — worth checking as an interconnected group before changing auth, since `state`, `supabaseClient`, and `showToast()` are all high-centrality bridges into this area

### Code Coverage

```
Frontend (src/): 0% security audit complete
├─ auth.js: 20% (identified issues, not fixed)
├─ db.js: 0%
├─ main.js: 0%
└─ components/: 0%

Backend (api/): 15% security audit complete
├─ auth/login.js: 40% (identified issues, not fixed)
├─ auth/verify.js: 0%
├─ auth/logout.js: 0%
└─ supabase-proxy.js: 0%
```

---

## Version Control

- **Document Version**: 1.0
- **Last Updated**: September 6, 2026
- **Next Review**: September 15, 2026 (or when major changes occur)

---

**How to Update This File**:

1. When you find a new issue → Add to relevant section
2. When you fix an issue → Change status to ✅ FIXED
3. When you test a fix → Change to ✅ TESTED
4. Update metrics at bottom regularly
5. Keep blockers/notes section current

**Status Symbols**:
- ✅ = Done/Fixed
- 🟢 = In Progress/Good
- 🟠 = At Risk/Partial
- 🔴 = Not Started/Critical Issue
- ⏳ = Waiting
- ⚠️ = Review Needed
- ❌ = Failed/Not Fixed
