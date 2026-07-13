# Phase status & handoff

**Last updated:** 2026-07-13  
**Purpose:** So a new chat can resume coding without rediscovering history.  
**Source of truth for design:** [phase-4-signoff.md](./phase-4-signoff.md), [roles-and-permissions.md](./roles-and-permissions.md), [phase-5b-role-rename.md](./phase-5b-role-rename.md)

---

## Start here next session

**Recommended next build:** confirm ops (migration + edge deploy), then pick a slice below.

### Next coding slice (pick one)

1. **Ops verify + 4D polish** — Confirm `028` + `create-user-v5` live. Optional: send notifications from OK Admin; Gurukul/Utilities logos; wire real apps later from sibling repos `egurukul` / `vault`.
2. **4C remainder — Personal-team mandatory OPH / FIN / FIH**  
   On user create (OK Admin / create-user), auto-assign OPH, FIN, and FIH on the new personal team (personal team is created today; those role assignments are not).
3. **Finance UX follow-ups** — Extend edit-budget line items to match create (header currency/rate, no per-line currency); any other create-budget edge cases found in smoke test.

**Do not start Phase 5B** (DB role rename) until 4C/4D are stable — see [phase-5b-role-rename.md](./phase-5b-role-rename.md).

---

## Completed (high level)

| Phase | Status | Notes |
|-------|--------|--------|
| Wallet / transfers **1–3** | **Done** | Migrations `013`–`018` (+ related). |
| Pre–Phase 4 mobile | **Done** | |
| **4A** Governance foundation | **Done** | |
| **4B** Approval platform | **Mostly done** | Polish items still open (flow admin UI, etc.). |
| **4C Lite** User lifecycle | **Done** (core) | Create login moved to One Kailasa Admin; Finance Users = department only. |
| **4D** One Kailasa shell | **v1 built** | Shared shell, routing, access, admin, home, profile. Ops deploy may still be pending. |
| **Phase 5** Reports expansion | **Not started** | |
| **Phase 5B** DB rename | **Deferred** | UI labels OPS/OPL/OPH; DB still `member`/`lead`/`oht`. |

---

## 4D — What was built (this sprint)

### Product decisions (locked)

- Login always lands on **One Kailasa home** (`/`), not Finance.
- Apps: **Finance** (live at `/finance`), **Gurukul** Coming soon (`/gurukul`), **Utilities** Coming soon (`/utilities`).
- **Option B people model:** one login identity for the whole platform.
- **One Kailasa Admin** (not Finance) owns: create people/logins, platform hold, which apps + menus, who is OK Admin.
- Seed OK Admin email: **`rishi.advait.one@gmail.com`** (in migration `028`).
- **Finance Admin → Users:** org roles / hold / team membership for Finance only — **no** “New user” create (platform create is OK Admin).
- **Profile** (`/profile`): account info + **Select apps** (which logos appear on home = `ok_home_pins`).
- **Messages:** `ok_messages` table; home notifications load on refresh (no push/chat in v1).
- Sibling codebases exist but are **not** wired yet: `C:\Users\user\Documents\GitHub\egurukul`, `C:\Users\user\Documents\GitHub\vault`.

### Shell / UX (Finance patterns reused)

- One Kailasa uses the **same shell as Finance**: `mobile-header`, `overlay`, `sidebar`, `app-topbar`, `main-content`, `bottom-nav`, cards / data-cards / tables.
- Shared chrome: [src/pages/ok-shell.js](../src/pages/ok-shell.js).
- Home: notifications + full-tile app logos (Finance uses `KMOF.png`; no “Finance” label under logo).
- Sidebar: Apps (Home + granted apps) → Account (Admin if OK admin, Profile last) → Sign Out.
- Bottom nav: Home / Profile / Admin (if OK admin) / Menu.
- Mobile Sign Out: sidebar footer padded above bottom nav so it is scrollable/visible.
- **Access is real:** unchecking Finance in OK Admin removes app from sidebar/logos (no auto-grant fallback when access rows are empty). Soft fallback only if `ok_app_access` table is missing.

### Routing

| Path | Screen |
|------|--------|
| `/` | One Kailasa home |
| `/profile` | OK Profile + Select apps |
| `/admin` | OK Admin (people + access) |
| `/finance` | Finance app (current KMOF UI) |
| `/gurukul`, `/utilities` | Coming soon |
| Vercel | SPA rewrite in [vercel.json](../vercel.json); Vite `appType: 'spa'` |

### Data (migration `028_one_kailasa_shell.sql`)

- `ok_admins`, `ok_app_access`, `ok_menu_access`, `ok_home_pins`, `ok_messages`
- `is_ok_admin()` helper + RLS
- Seeds Finance app + menus + home pin for existing `users`; seeds OK Admin by email
- OK admins can select/update `users` for platform hold

### Edge function

- [supabase/functions/create-user/index.ts](../supabase/functions/create-user/index.ts) — version tag **`create-user-v5`**
- Allows **OK Admin** or Finance org admin to create auth users

### Key files (4D)

- `supabase/migrations/028_one_kailasa_shell.sql`
- `src/pages/ok-shell.js`, `ok-home.js`, `ok-profile.js`, `ok-admin.js`, `ok-coming-soon.js`
- `src/utils/okAccess.js`
- `src/main.js` (path routing, Finance shell, page titles in top bar)
- `KMOF.png` (Finance logo on home)

### Ops checklist (4D) — do these in Supabase if not done

- [ ] Run migration **`028_one_kailasa_shell.sql`** in SQL Editor  
- [ ] Redeploy Edge Function **`create-user`** (code contains `create-user-v5`)  
- [ ] Smoke: login → One Kailasa home → Finance logo → Back to One Kailasa  
- [ ] Smoke: `/admin` as `rishi.advait.one@gmail.com` → create person / toggle apps / save  
- [ ] Smoke: user with Finance unchecked → Finance gone from sidebar and home logos  

---

## Finance UX updates (same sprint)

### Shell titles

- Desktop top bar + mobile header show **menu name** (e.g. “New Budget Plan”), not always “Finance”.
- Titles map in [src/main.js](../src/main.js) `PAGE_TITLES` / `updateShellPageTitle`.

### Create Budget ([src/pages/budgets.js](../src/pages/budgets.js))

- Header row: **Budget type + period + name** together; status / currency / rate on second row.
- Line items: **desktop = table-like rows**; **mobile = cards**.
- Amounts default to **0** (user need not type 0); zeros are saved.
- No per-line currency or exchange rate — header currency + rate drive conversion.
- Enter USD on the line; **local amount** = header rate × USD (fixed conversion bug from empty line rate).
- DB category rows still store `currency`, `rate`, `usdAmount`, `localAmount` from the header + calculated local.

**Not yet done for Edit Budget:** edit modal still has per-line currency/rate UI; align later if desired.

---

## Still open from earlier phases

### 4C (from sign-off)

| Item | Status |
|------|--------|
| User mgmt lite + hold + forgot password | **Done** |
| App / module access | **Done via 4D** (`ok_app_access` / `ok_menu_access`) |
| Mandatory OPH / FIN / FIH on personal team at create | **Not started** |

### 4B polish (not blocking)

- Admin UI to edit approval flows  
- Richer group-send UX  
- CAO budget matrix  
- Portal “switch team workspace”  
- Dedicated FIN read-only productization  

---

## Product rules to remember

- **Three layers:** org role (`users.role`) ≠ team access (`user_teams.access_level`) ≠ approval pools (`request_role_assignments`).  
- **Platform layer (4D):** OK Admin + `ok_app_access` / `ok_menu_access`.  
- **Accounts:** created by One Kailasa Admin (not public signup).  
- **Founder is non-technical:** short confirmations; explain only when asked (“Explain this” / “Why?”).  
- **New features:** mobile + desktop together (same shell patterns as Finance).

---

## Suggested first prompt for next chat

> Read `docs/phase-status.md`. Confirm whether migration `028` and `create-user-v5` are deployed. Then either finish 4C personal-team OPH/FIN/FIH on create, or smoke-test and polish 4D / create-budget follow-ups listed under “Next coding slice.”
