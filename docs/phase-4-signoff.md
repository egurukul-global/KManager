# Phase 4 Sign-Off Document

**Status:** Approved for planning — implementation starts after mobile pre-work  
**Last updated:** 2026-07-11  
**Mode:** Discuss-first; no Phase 4 app code until this doc is explicitly re-approved for build

---

## Build order (mandatory)

| Order | Work |
|-------|------|
| **Pre–Phase 4** | Mobile cleanup on existing KMOF screens (see [Mobile pre-work](#mobile-pre-work-d2)) |
| **Phase 4A–4D** | Governance, approvals, portal, shell (below) |
| **Phase 5** | Reports expansion (separate menu; design TBD) |
| **Phase 5B** | DB `access_level` rename — see [phase-5b-role-rename.md](./phase-5b-role-rename.md) |

**Going forward:** New features ship **mobile + desktop together**. If desktop ships first, **mobile conversion is a mandatory final gate** before that sub-phase is done.

---

## Role codes (display labels until Phase 5B)

| Code | Name | Maps from DB (today) | Notes |
|------|------|----------------------|--------|
| **OPS** | Operations Staff | `member` | Own member + personal buckets only |
| **OPL** | Operations Lead | `lead` | Team operational buckets; submits budgets |
| **OPH** | Operations Head | `oht` | Scoped teams; review in flow |
| **FIN** | Finance Team | *(new assignment)* | FIH-assigned; full finance read in team scope |
| **FIH** | Finance Head | org role / assignment | Assigns FIN; defines flows with CAO |
| **CAO** | Chief Admin Officer | `caoh` | Final approver in default budget flow |
| **CEO** | Chief Executive | `ceo` | Not in default flow; read-all; add to request with warning |
| **VIEW** | Read-only | `view` | Scoped finance read |
| **SYS** | System admin | `admin` | Infra; not in approval chain |

### Extended request-role codes (not org departments)

Roles are assigned per **request type** and flow — not a “department” entity.

| Code | Meaning | Example request type |
|------|---------|----------------------|
| **LEG** | Legal team | Legal request (future) |
| **LEH** | Legal Head | Legal request (future) |
| **GUT** | Gurukul team | Gurukul request (future) |
| **GUH** | Gurukul Head | Gurukul request (future) |

Users assigned to a role code are **notified** when a request needs that step.

**Registry (D1):** Table `request_role_assignments` (or equivalent): `user_id`, `role_code`, `team_id` (nullable for global), `request_type`, active flag.

---

## Navigation (C2)

| Menu | Phase 4 contents |
|------|------------------|
| **Financials** | Financial Status, reconciliation summary/detail, operational money views |
| **Reports** | Expense Reports only for now |
| **Phase 5** | Additional report types — separate phase |

Reconciliation filter view lives under **Financials**, not Reports.

---

## Pillar A — Visibility & reconciliation

### Bucket visibility

| Bucket type | OPS | OPL+ | OPH / VIEW / FIN (scoped) |
|-------------|-----|------|---------------------------|
| Team operational | Hidden | Visible | Read (if in scope) |
| Member bucket (work team) | Own only | All on team | Read |
| Named personal team | Own only | Own | Read if in scope |

- Member buckets: **auto-created** on add to work team — no separate assignment screen.
- OPS **cannot** create own bucket on work team.
- Delete: soft-delete; non-zero balance blocked (existing guards).

### Reconciliation submit rules

| Role | Submits |
|------|---------|
| **OPS** | Own member buckets + named personal team buckets |
| **OPL** | Team operational buckets + own personal; ensures team completion |

- **Non-zero buckets only** — zero balance = deemed reconciled.
- **Per work team** progress: e.g. **4 of 5** (team operational + member buckets on **that team only**).
- Do **not** mix work teams; **named personal team** is separate from work-team member buckets.
- OPL sees which OPS have **not** reconciled.

### Reconciliation view (summary → detail)

**Menu:** Financials → Reconciliation (or equivalent).

**Summary row (dense, mobile-friendly):** team, period, progress (4/5), reconciled yes/no, discrepancy flag, bucket counts, last date, filters.

**Filters (everyone uses same UI; access limits data):**

| Filter | Options |
|--------|---------|
| Team | List + **ALL** |
| Date range | From / to |
| Status | Reconciled / not reconciled |
| Discrepancy | Yes / no |
| Reasons | Where comments exist |

**Detail:** Click summary row → bucket-level lines, amounts, messages.

---

## Pillar B — Approval platform

### Request numbering

| Item | Format | Example |
|------|--------|---------|
| User alias | 3–5 chars, unique, profile | `TTM`, `RISHI`, `NBS` |
| Individual request | `{alias}-{counter}` | `TTM-42` |
| Group (on Send) | `{alias}-{counter}` | `RISHI-275` |

- Counter increments per user per new request/group.
- Searchable by anyone with access: `TTM-42`, `RISHI-275`.

### Grouping

- **Convenience only** — checkbox per line.
- Open group → individual requests; act separately or together.
- Approve several items → stays with approver → **Send** selected approved only.
- **Reject group:** each item returns to **its own team**.
- Unapproved items **cannot** be sent (R6).

### Actions

| Action | Effect |
|--------|--------|
| **Reject** | Back to team; optional message |
| **Approve** | Recorded; stays with same approver |
| **Approve & Send** | Approve + forward to next step |
| **Send** | Forward already-approved items (multi-select) |

All reject / clarify / general comms = **one message type** (no separate reason vs clarification types). Latest message on top.

### Clarification

- Raised by active approver (OPH, OPL, FIN, FIH, or flow role e.g. LEG).
- Status: `CLARIFY-{ROLE}` (e.g. `CLARIFY-OPL`, `CLARIFY-FIH`, `CLARIFY-LEG`).
- **Reply only** — no budget edits in clarify; to change budget → **reject**.
- Can add another role (e.g. LEG) to thread.

### Status model (simplified)

No `1-OPH`, `2-FIN` step numbers.

| Status | Meaning |
|--------|---------|
| `DRAFT` | OPL editing |
| `SUBMITTED` | In flight |
| `CLARIFY-*` | Waiting on named role |
| `{ROLE}-REVIEWED` | Intermediate step complete |
| `{ROLE}-APPROVED` | **Final** step in configured flow |
| `REJECTED` | Back to team |

- If CAO appears once in flow, **one CAO action** satisfies CAO — no duplicate approvals.
- If FIN is in flow, they remain in queue when it is their turn (even after out-of-order steps above).

### Bulk / partial send (Q13)

- Partial OK: e.g. **18/20 sent**; 2 remain pending with clear errors — “Please resend 2”.
- Failed rows stay on approver list.

### Dashboard (team)

- Show **messages** for outcomes: approved, rejected, clarify — not every internal state.

### Request types

| Type | Phase |
|------|--------|
| **Budget** | 4A / 4B |
| **Money transfer** (cross-team) | 4B |
| Legal, Gurukul, etc. | Later — same platform |

### Configurable flows (table-driven; admin UI later)

- **FIH or CAO** defines flow per **request type**.
- Overrides: per **team**, per **user** (personal team), per **budget/route** (e.g. medical → MED role).
- Example: team reports directly to CAO → skip FIN/FIH in table.
- CEO: not in default flow; anyone can add with **“Are you sure?”** Yes/No.

**Phase 4B schema (conceptual):**

- `approval_flow_definitions` — request_type, team_id?, user_id?, priority
- `approval_flow_steps` — flow_id, step_order, role_code, is_final
- `approval_requests` — request_number, type, team_id, status, current_step, amounts, …
- `approval_request_messages` — thread, latest first
- `approval_groups` — group_number, parent request links

---

## Pillar C — Management portal

**One UI for everyone (OPS → CAO).** Access reduces visibility only.

### Defaults

- Show **my** approval items only (not SHOW ALL).
- Show **active** requests only.

### Filters

- **SHOW ALL** toggle
- Status: active / closed / rejected / … (each with **ALL**)
- Search by request number (`TTM-42`)
- Request type: budget only in UI for early 4B; money transfer added in 4B

### Views

| View | Behavior |
|------|----------|
| **Inbox / matrix** | **Peek** — triage, approve, message |
| **Open team workspace** | **Switch** global team context → full KMOF for that team |

### Budget matrix

- Monthly calendar name = **convenience label**; approval is **per team**.
- Rows = teams; checkbox; per-team total + optional group total.
- CAO (or any approver): check teams → **Approve & Send**.

### FIN visibility

Within assigned teams: budgets, expenses, income received, receipts — full finance read.

---

## Pillar D — User lifecycle & One Kailasa shell

### User management (v1)

| Action | Who |
|--------|-----|
| Create user | OPH (own teams only), FIH, CAO, SYS |
| Assign team roles | Same |
| Assign FIN / LEG / etc. | FIH (FIN); flow owners for other role codes |
| On hold | Admin — **cannot log in** (v1) |
| Delete | Soft delete = hold |

### Personal team on create (mandatory before save)

- Assign **OPH**, **FIN**, **FIH** on personal team.
- Applies even if user has no work teams.

### App & module access

- Per user: which apps (KMOF, Gurukul, …) and which modules (budget, expenses, …).
- On hold (future): module-level; v1 = no login.

### Auth

- Forgot password on login.
- **v1:** 1-step email reset.
- **Later:** 2FA / secondary email in user profile.

### One Kailasa shell (4D)

| URL | App |
|-----|-----|
| `https://onekailasa.vercel.app/` | Main login + dashboard |
| `.../KMOF` | Ministry of Finance (current codebase) |
| `.../gurukul` | Future |

- Same credentials; shared session.
- Logout anywhere → logout everywhere.
- Dashboard: keyword app search; **fixed notification** box; other widgets from access-based picker.
- Frequent apps: **recent + optional pin** (v1).
- Cross-team messages: “10 messages in Team A, 3 in Team B”.

---

## Phase 4 sub-phases

### Pre–Phase 4: Mobile pre-work (D2)

Priority screens — card/summary pattern (Exchange Rates as reference):

1. View Budgets  
2. Income Manager  
3. Expense Manager  
4. Money Buckets  
5. Financial Status  
6. Transfer list  
7. Team / roster tables  

Pattern: **summary list → tap → detail**.

### 4A

- User alias + `TTM-42` request IDs  
- Unified messages  
- Simplified approval statuses  
- OPS bucket hide; owned-bucket reconcile  
- Reconciliation summary/detail view  
- OPL team progress (4 of 5)  

### 4B

- Flow tables + budget + money transfer request types  
- Management portal (peek + switch)  
- `request_role_assignments` (FIN, LEG, LEH, …)  
- Group send; partial bulk errors  

### 4C

- User mgmt lite  
- Hold; app/module matrix  
- Personal-team mandatory OPH/FIN/FIH  
- Forgot password (1-step)  

### 4D

- One Kailasa shell, `/KMOF` routing, shared session  
- App launcher, notifications, team message counts  

---

## Phase 5 (separate — not Phase 4)

- **Reports** menu expansion: new report types beyond Expense Reports  
- Design TBD; mobile summary → detail from day one  

---

## Related documents

- [phase-status.md](./phase-status.md) — **what is done / what to build next** (handoff for new chats)
- [roles-and-permissions.md](./roles-and-permissions.md) — org role vs team access vs role assignments (where to configure OPH, FIN, etc.)
- [phase-5b-role-rename.md](./phase-5b-role-rename.md) — DB migration when ready  
- Wallet Phases 1–3: migrations `013`–`018` (run in Supabase before testing)  

---

## Sign-off checklist

- [ ] Mobile pre-work scope approved (D2)  
- [ ] Phase 4A–4D breakdown approved  
- [ ] Phase 5 (reports) deferred and acknowledged  
- [ ] Phase 5B (DB rename) deferred; doc stored  
- [ ] Explicit “start mobile pre-work” or “start Phase 4A” command before coding  
