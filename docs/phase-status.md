# Phase status & handoff

**Last updated:** 2026-07-13  
**Purpose:** So a new chat can resume coding without rediscovering history.  
**Source of truth for design:** [phase-4-signoff.md](./phase-4-signoff.md), [roles-and-permissions.md](./roles-and-permissions.md), [phase-5b-role-rename.md](./phase-5b-role-rename.md)

---

## Start here next session

**Recommended next build:** polish 4D (messages send UI, Gurukul/Utilities logos), then remaining **4C** items if needed.

### Next coding slice (pick one)

1. **4D polish** — richer notifications send from OK Admin; app logos for Gurukul/Utilities; confirm migration `028` + edge `create-user-v5` deployed.
2. **4C remainder — Personal-team mandatory OPH / FIN / FIH**  
   On user create, auto-assign OPH, FIN, and FIH on the new personal team.
3. **4C remainder — App / module access matrix**  
   Largely superseded by 4D `ok_app_access` / `ok_menu_access`; confirm any remaining Finance-only needs.

**Do not start Phase 5B** (DB role rename) until 4C/4D are stable — see [phase-5b-role-rename.md](./phase-5b-role-rename.md).

---

## Completed (high level)

| Phase | Status | Notes |
|-------|--------|--------|
| Wallet / transfers **1–3** | **Done** | Migrations `013`–`018` (+ related). |
| Pre–Phase 4 mobile | **Done** | |
| **4A** Governance foundation | **Done** | |
| **4B** Approval platform | **Mostly done** | |
| **4C Lite** User lifecycle | **Done** (core) | Finance Users no longer creates platform logins (moved to OK Admin). |
| **4D** One Kailasa shell | **In progress (v1 built)** | Home, `/finance`, Coming soon apps, OK Admin, messages table, access tables. |
| **Phase 5** Reports expansion | **Not started** | |
| **Phase 5B** DB rename | **Deferred** | |

---

## 4D decisions (locked)

- Login → **One Kailasa home** (`/`).
- Apps: **Finance** (live at `/finance`, logo `KMOF.png`), **Gurukul** / **Utilities** (Coming soon).
- **One Kailasa Admin** owns people/logins, hold, app + menu access (not Finance department).
- Seed OK Admin: `rishi.advait.one@gmail.com` (migration `028`).
- Finance Users = Finance org roles / department only.
- Profile / home: choose which app logos show (`ok_home_pins`).
- Messages: `ok_messages`, load on home refresh.

### Ops checklist (4D)

- [ ] Run migration `028_one_kailasa_shell.sql` in Supabase SQL Editor  
- [ ] Redeploy Edge Function **`create-user`** (`create-user-v5` — allows OK admins)  
- [ ] Smoke: login → One Kailasa home → open Finance → Back to One Kailasa  
- [ ] Smoke: `/admin` as seeded OK admin → create person / save app access  

### Key files (4D)

- `supabase/migrations/028_one_kailasa_shell.sql`  
- `src/pages/ok-home.js`, `ok-admin.js`, `ok-coming-soon.js`  
- `src/utils/okAccess.js`  
- `src/main.js` (routing)  
- `KMOF.png` (Finance logo on home)  

---

## Product rules to remember

- **Three layers:** org role (`users.role`) ≠ team access (`user_teams.access_level`) ≠ approval pools (`request_role_assignments`).  
- **Platform layer (4D):** OK Admin + `ok_app_access` / `ok_menu_access`.  
- **Accounts:** created by One Kailasa Admin (not public signup).  
- **Founder is non-technical:** prefer short confirmations; explain only when asked.  
- **New features:** mobile + desktop together.

---

## Suggested first prompt for next chat

> Read `docs/phase-status.md`. Confirm migration 028 ran. Polish 4D notifications or finish 4C personal-team OPH/FIN/FIH.
