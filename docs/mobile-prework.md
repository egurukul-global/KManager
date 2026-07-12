# Mobile Pre-Work (Pre–Phase 4)

**Status:** Complete (v1)  
**Last updated:** 2026-07-11

## Pattern

- **Desktop:** `show-desktop` + table (or responsive grid)
- **Mobile (≤768px):** `show-mobile` + `data-card-list` with `data-card--compact`
- **Summary → detail:** `data-card--expandable` + `toggleFinStatusDetail()` (Financial Status)

Reference implementation: Exchange Rates (`rates.js`), View Budgets (`budgets.js`).

## Screens updated

| Screen | Mobile treatment |
|--------|------------------|
| View Budgets | Already had cards; unchanged |
| Income Manager | Already had cards; desktop table in `show-desktop` |
| Expense Manager | Cards + bulk actions desktop-only |
| Money Buckets | `data-card` grid (`bucket-data-list`) |
| Financial Status | Summary cards + tap expand; history cards |
| Transfer (sent list) | Desktop table + mobile cards |
| Team Mgmt / Roster | Desktop table + mobile cards per team/member |

## CSS (`src/styles/mobile.css`)

- `.data-card--expandable`, `.data-card-detail`, `.data-card-expand-trigger`
- `.bucket-data-list` responsive grid
- `.selected` highlight on reconciliation history cards
- Transfer list header stacks on mobile

## Retest

1. Resize browser to &lt;768px or use phone
2. Open each screen above — no horizontal table scroll required
3. Financial Status → Generate Report → tap card for breakdown
4. Reconciliation History → tap row/card → detail with mobile line cards

## Going forward (Phase 4+)

Build mobile + desktop together for every new screen.
