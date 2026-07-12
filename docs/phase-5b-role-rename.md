# Phase 5B — Database Role Rename

**Status:** Documented now; **do not run** until explicitly scheduled  
**Last updated:** 2026-07-11  
**Why wait:** Until 5B, the app uses **display labels** (OPS, OPL, OPH, FIN) while the database keeps legacy values (`member`, `lead`, `oht`, `view`). This avoids a large migration mid–Phase 4.

**Risk if we skip 5B:** Future developers forget that `member` means OPS and bugs appear in RLS, reports, and support.

---

## Display mapping (use in app until 5B)

| DB value (`user_teams.access_level`) | Display label | New DB value (5B) |
|--------------------------------------|---------------|-------------------|
| `member` | OPS | `ops` |
| `lead` | OPL | `opl` |
| `oht` | OPH | `oph` |
| `view` | VIEW | `view` *(unchanged)* |
| `admin` | Team Admin | `team_admin` *(optional — see below)* |
| *(new)* | FIN | `fin` |

### Org roles (`users.role`) — separate from team access

| DB value | Display | Notes |
|----------|---------|--------|
| `admin` | SYS | System admin |
| `caoh` | CAO | |
| `oh` | FIH? | Confirm mapping at 5B — may stay `oh` or become `fih` |
| `ceo` | CEO | Read-all; not in default approval flow |

**Action at 5B kickoff:** Confirm whether `users.role = oh` becomes `fih` or stays separate from team-level FIN assignment.

---

## Pre-migration audit checklist

Run before writing migration SQL:

1. **Grep codebase** for string literals:
   - `'member'`, `'lead'`, `'oht'`, `'view'`, `'admin'`
   - Files: `src/state.js`, `src/utils/navPermissions.js`, `src/pages/team-mgmt.js`, all RLS-related app filters

2. **Grep SQL migrations** for `access_level` in policies:
   - `011_team_management_rls.sql`
   - `012_fix_users_rls_recursion.sql`
   - `016_oht_team_roster.sql`, `017_fix_user_teams_rls_recursion.sql`
   - `003_expenses_rls.sql`, `004_expense_receipts.sql`, `005_reconciliation_submissions.sql`, `009_reconciliation_all_scope_rls.sql`
   - `018_reconciliation_view_readonly.sql`

3. **List check constraints** on `user_teams.access_level` if any exist.

4. **Export counts** per access_level:
   ```sql
   SELECT lower(trim(access_level)) AS level, COUNT(*)
   FROM user_teams
   GROUP BY 1
   ORDER BY 1;
   ```

5. **Document** any Supabase Edge Functions or external scripts using old values.

---

## Migration steps (outline)

### Step 1 — Add new values (non-breaking)

If using a check constraint, widen it first to allow both old and new values.

### Step 2 — Backfill data

```sql
-- EXAMPLE ONLY — run in maintenance window after review

UPDATE user_teams SET access_level = 'ops'   WHERE lower(trim(access_level)) = 'member';
UPDATE user_teams SET access_level = 'opl'   WHERE lower(trim(access_level)) = 'lead';
UPDATE user_teams SET access_level = 'oph'   WHERE lower(trim(access_level)) = 'oht';
-- view unchanged
-- admin → team_admin if renaming team-level admin (optional)
```

### Step 3 — Replace RLS policies

Every policy comparing `access_level` must be updated. Known helpers to recreate:

| Function | Notes |
|----------|--------|
| `is_team_roster_manager()` | Checks `oph` instead of `oht` |
| `user_is_oht()` | Rename to `user_is_oph()` |
| Reconciliation write policies | `NOT IN ('view', 'oph')` |
| Expense / income visibility | `lead` → `opl`, `oht` → `oph` |

Use `SET row_security = off` on SECURITY DEFINER helpers that read `user_teams` (see migration 017 pattern).

### Step 4 — Tighten constraints

- Drop old values from check constraint enum list.
- Optionally add `fin` to allowed values after FIN assignment feature ships.

### Step 5 — App code single pass

- Remove display-only mapping layer in `state.js` / `team-mgmt.js`.
- Use DB values directly in UI labels via a single `ACCESS_LEVEL_LABELS` map.
- Update `navPermissions.js`, `computePermissions()` switch cases.
- Update seed data and tests.

### Step 6 — Verify

| Test | Roles |
|------|--------|
| OPS nav restricted | `ops` |
| OPL budgets + team reconcile | `opl` |
| OPH roster + read-only finance | `oph` |
| VIEW read-only | `view` |
| FIN verify (post–Phase 4B) | `fin` |
| RLS no recursion | login, buckets, expenses load |

---

## Rollback plan

1. Keep migration `018_rollback_5b.sql` (to be written at 5B time) that reverses value renames.
2. Deploy app rollback that still understands **both** old and new values for 24h if needed.

---

## Relationship to Phase 4

| Phase | Role handling |
|-------|----------------|
| **Pre–4 / 4A–4D** | Display labels OPS/OPL/OPH; DB unchanged |
| **4B** | New table `request_role_assignments` uses role **codes** (`FIN`, `LEG`, `LEH`) — not `user_teams.access_level` for FIN |
| **5B** | Rename `user_teams.access_level` values; align RLS + app |

FIN team access may exist as:

- `request_role_assignments.role_code = 'FIN'` (approval flows), and/or  
- `user_teams.access_level = 'fin'` after 5B  

Decide at 4B implementation whether FIN also gets a `user_teams` row with `view` + flags, or dedicated `fin` level after 5B.

---

## Files to update at 5B (checklist)

### Application

- [ ] `src/state.js` — `computePermissions()`, `hasAccess()`
- [ ] `src/utils/navPermissions.js`
- [ ] `src/pages/team-mgmt.js` — ACCESS_LEVELS options
- [ ] `src/main.js` — access badge display
- [ ] `src/utils/teamAccess.js` — if normalized levels cached
- [ ] Any page checking `access_level === 'lead'` etc.

### Database (new migration `0XX_phase5b_role_rename.sql`)

- [ ] `user_teams` data backfill
- [ ] All RLS policies referencing access_level
- [ ] Functions: `is_team_roster_manager`, `user_is_oht` → rename
- [ ] Comments on `user_teams.access_level` column

### Documentation

- [ ] Update [phase-4-signoff.md](./phase-4-signoff.md) mapping table
- [ ] README or onboarding note for new developers

---

## When to schedule 5B

Recommended **after**:

- Phase 4B stable in production  
- FIN assignment and `request_role_assignments` live  
- No pending large RLS changes  

Schedule a **maintenance window**; run audit queries first; test on staging with production data snapshot.

---

## Quick reference card (post for dev team)

```
LEGACY → DISPLAY → 5B DB
member → OPS      → ops
lead   → OPL      → opl
oht    → OPH      → oph
view   → VIEW     → view
admin  → Team Admin → team_admin (optional)
(new)  → FIN      → fin
```
