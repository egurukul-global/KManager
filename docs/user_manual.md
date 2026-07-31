# One Kailasa (OK) Application User Manual

Welcome to the **One Kailasa (OK) App** User Manual. This document provides an in-depth operational guide to the features, modules, navigation, and permissions system of the One Kailasa platform.

---

## 1. Platform Foundation & Navigation (The OK Shell)

The **One Kailasa Shell** provides a unified, responsive chrome layout shared across all apps. It adapts automatically to desktop, tablet, and mobile views.

### Navigation Elements
*   **Desktop View:**
    *   **Sidebar Navigation:** Access Home, Profile, Admin Portal (for authorized administrators), App Launcher, and Sign Out.
    *   **Top Bar:** Displays the current active page/menu name and user profile shortcut.
*   **Mobile View:**
    *   **Mobile Header:** Shows the page title and quick navigation trigger.
    *   **Bottom Navigation Bar:** Quick access tabs for **Home**, **Profile**, **Admin** (if authorized), and **Menu** (drawers/options).
    *   **Scrollable Sidebar Footer:** Clean exit via the "Sign Out" button padded safely above the bottom navigation bar.

### One Kailasa Home (`/`)
*   **App Pins:** The home screen presents large-tiled icons for all allowed applications (e.g., Finance, Tasks, Konnect).
*   **On-Load Notifications:** Displays persistent system alerts, messages, and approvals waiting for action.
*   **Dynamic Visibility:** Apps only appear on the home screen if the user has been granted access.

### My Profile (`/profile`)
*   **Account Settings:** View profile picture, full name, email, and base currency.
*   **App Pin Customization (`ok_home_pins`):** Toggle which allowed applications are pinned to your home page.

---

## 2. One Kailasa Admin Portal (`/admin`)

The Admin Portal is the single source of truth for identity management, access levels, and security controls. Only users in the `ok_admins` list can access this portal.

### User Identity Management
*   **User Creation:** Create new system members (Logins and Profiles) via the secure `create-user` edge function.
*   **Platform-Wide Hold:** Instantly suspend any account. A user on "Hold" is locked out of all sub-applications.
*   **Universal Identity Model:** A single login identity credentials a user across all sibling applications (Finance, Konnect, Tasks).

### App & Menu Access
*   **Granular Authorization:** Assign app-level permissions (`ok_app_access`) to grant or revoke access to entire modules.
*   **Menu Visibility (`ok_menu_access`):** Limit specific sidebar links and dashboard items based on the user's role.

---

## 3. Finance Module (`/finance`)

The Finance module handles budgets, expenses, wallet transfers, reconciliations, and multi-tier hierarchical approvals.

### Budget Management (`/finance/budgets`)
*   **Create Budget Plans:**
    *   Set the budget type, period, and name.
    *   Specify base currency and exchange rates on the header level.
    *   Line-item values auto-convert (USD to local amount) based on header rates. Zero values are allowed and saved.
*   **Budget Category Allocation:** Select from pre-approved master categories (`category-master.js`).

### Expense Claims (`/finance/expenses`)
*   **Expense Submission:** Log individual transactions with descriptions, amounts, and attachment receipts.
*   **My Finances:** Users can track their own submissions, personal ledger balances, and pending reimbursement statuses.

### Wallets & Transfers (`/finance/transfer`)
*   **Inter-Wallet Transfers:** Transfer funds between team wallets, personal wallets, and operational accounts.
*   **Ledger Sync:** All transfers write audit logs to prevent untraced capital movement.

### Bank Reconciliation (`/finance/reconcile`)
*   **Transaction Matching:** Cross-reference bank statement uploads against internal expense claims and ledger entries.
*   **Reconciliation Approvals:** Operations Heads (OPH) and Finance (FIN) review and sign off on reconciled bank balances.

### Hierarchical Approval Portal (`/finance/approval-portal`)
Approval workflows follow a strict hierarchical structure based on roles:
1.  **OPS (Operations Staff):** Submits budgets, claims, or transfers.
2.  **OPL (Operations Team Lead):** Initial review and team-level approval.
3.  **OPH (Operations Head):** Departmental validation.
4.  **FIN (Finance Officer):** Audits financial policy compliance.
5.  **FIH (Finance Head):** Final authorization for disbursements.

---

## 4. Konnect Module (`/konnect`)

**Konnect** serves as the primary messaging, communication, and notification channel.

*   **Chat Rooms & Direct Messaging:** Connect with individuals and teams within permitted boundaries.
*   **Unified Approvals Stream:** Deep-linked messages alert OPLs, OPHs, and Admins of pending budget approvals, tasks, or policy bypass alerts. Clicking the message navigates directly to the target item.

---

## 5. Tasks & Instructions Module (`/tasks`)

Track commitments, daily metrics, and organizational instructions.

*   **Task Assignment:** Assign tasks to individual users or to entire teams (where the team lead can delegate/re-assign).
*   **Guruvak Integration:** Special high-priority organizational instructions tagged with `"guruvak"` for distinct tracking and execution reporting.
*   **Filters & Search:** Filter by assignee, reporter, status (To Do, In Progress, Completed), and tags.

---

## 6. Under Construction Modules

*   **Gurukul (`/gurukul`):** Educational registry and syllabus trackers (Placeholder).
*   **Utilities (`/utilities`):** General tools, settings, and utility applications (Placeholder).
