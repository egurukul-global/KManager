# One Kailasa Project Roadmap & Status

This document is the single source of truth for the project roadmap, completed features, pending backlogs, and active design decisions.

---

## 1. Roadmap & Phase Status

| Phase | Title | Description | Status |
| :--- | :--- | :--- | :--- |
| **Phases 1–3** | Wallet & Transfers | Wallet, transfer state machine, personal teams cross-team access. | **Done** |
| **Pre-Phase 4** | Mobile Prework | Mobile layout optimizations. | **Done** |
| **Phase 4A** | Governance Foundation | Access rules and role definitions. | **Done** |
| **Phase 4B** | Approval Platform | Workflow engine, RLS policies, skip-level approvals, and role-based flows. | **Done** |
| **Phase 4C** | User Lifecycle & Auto-Assign | Platform hold, login creation, and auto-assigning OPH/FIN/FIH roles to personal teams. | **Done** |
| **Phase 4D** | One Kailasa Shell | Router, navigation, app pinning, shared chrome, and profile app visibility. | **Done** |
| **Phase 4E** | Tabbed User Panel & Granular Permissions | Chat permissions (opposite-gender, cross-team, allowed users/roles/teams list, Konnect Hub). | **Done** |
| **Phase 4F** | Team Hierarchy & Cross-Department Roles | M:N parent-child team structures (`team_relationships`), recursive sub-team resolution. | **Pending** |
| **Phase 4G** | Leadership Hotline & Security Overrides | Emergency hotline bypassing gender/team constraints with CAO suspension controls. | **Pending** |
| **Phase 4H** | Impersonation & Shadowing Mode | Read-only shadowing mode for CEO/CAO and authorized staff. | **Pending** |
| **Phase 4I** | Tasks & Guruvak (Instructions) | Guruvak instruction tagging, task auto-numbering (done), spacious task UI, team assignment. | **In Progress** |
| **Phase 4J** | FIP Payment & TL Allocation | FIP budget payments with discrepancy comment rules, TL receipts, and bucket allocation. | **Pending** |
| **Phase 5A** | Core Modules Expansion | Goal Tracker, Housing Registry, Donor Manager, Activity Metrics, OPH Group budgeting. | **Pending** |
| **Phase 5B** | Database Role Rename | Rename legacy DB roles (`member` -> `ops`, `lead` -> `opl`, `oht` -> `oph`). | **Deferred** |
| **Phase 6** | Basic CRM & Lifecycles | Profile lifecycle status transitions (Adheenavasi/Kailasavasi), seva logs, donation history. | **Future** |
| **Phase 7** | Document Management | Government ID tracking, passport expiry alert engine, R2 secure document storage. | **Future** |
| **Phase 8** | Messaging & Security | Broadcast channels, silent mode, read receipts, and system broadcast alerts. | **Future** |
| **Phase 9** | Custom Password Rules | Custom password validation constraints and delegated boss resets. | **Future** |
| **Phase 10** | Organizational AI Insights | Semantic search, executive summaries, self-refinement UI audit. | **Future** |

---

## 2. Active Design Decisions & Product Rules

### Platform & Shell Layer
* **Login & Routing:** Users land on One Kailasa home (`/`). Sibling apps include Finance (`/finance`), Gurukul (`/gurukul`, coming soon), and Utilities (`/utilities`, coming soon).
* **Identity:** Single login identity across the entire platform.
* **Administration:** One Kailasa Admin manages users, logins, platform hold, and application pins (`ok_home_pins`).
* **Profile:** Users customize visible/pinned apps on home via `/profile`.

### Access & Role Control
* **Three-Layer Access:** Org roles (`users.role`) $\neq$ Team access (`user_teams.access_level`) $\neq$ Approval pools (`request_role_assignments`).
* **Pure Role-Based Approvals:** FIN, FIP, and FIH check permissions strictly via `request_role_assignments`. CAO, CEO, and Admin retain implicit system mappings.
* **Gender Scopes:** Teams enforce `gender_scope` (`male`, `female`, `mixed`) constraints for messaging and group operations.

### Finance Rules
* **Create Budget:** Header currency/rate rules conversion for all line items. Line amounts default to 0. No per-line currency selection.
* **FIP & FIN Operations:** FIN/FIP roles can select and manage budget plans.

---

## 3. Detailed Phase Breakdown (Pending & Future)

### Phase 4F: Team Hierarchy & Cross-Department Roles
* **Association Schema:** Create `team_relationships` table for M:N parent-child mapping.
* **Recursive Resolution:** Update database functions/RLS to recognize sub-teams recursively (e.g. broadcasting to a parent team includes members of sub-teams).
* **Department Tiers:** Add `team_type` and `department` fields to teams, mapping team roles (OPS/OPL/OPH) to department-specific names in the UI.

### Phase 4G: Leadership Hotline & Security Overrides
* **Hotline Interface:** Add an emergency Hotline button in the sidebar or chat drawer listing department heads (H-level), CAO, and CEO.
* **Bypass RLS:** Write security policy overrides allowing messages sent through the hotline to ignore gender and team constraints.
* **Suspension Controls:** Implement CAO/CEO administration controls to disable hotline access for specific users.

### Phase 4H: Impersonation & Shadowing Mode
* **Impersonation UI:** Add a "Shadow User" dropdown for the CEO, CAO, and authorized office staff.
* **Read-Only RLS Policies:** Allow users with the shadowing permission to read messages and tasks belonging to the target user.
* **Global Access:** Grant default global cross-team and cross-gender access to CEO and CAO accounts.

### Phase 4I: Tasks & Guruvak (Instructions) System
* **Guruvak Creation:** Any user can enter a Guruvak instruction: select department, one-line name, detailed description, keywords, attachments, and assign to self or others.
* **Access Save & Assign:** If the creator doesn't have direct access to the assignee, they save the record, and a user with correct clearance can perform the assignment later.
* **Task Integration:** Guruvaks will be stored in the task database with a `"guruvak"` tag/context.
* **UI Refactors:** Enhance the task search/filter options and expand the message/description space to be much more spacious and UI-friendly.
* **Task & Team Assignment:** Support assigning tasks directly to whole Teams in addition to individual Users. The OPL (Team Lead) or OPH (Operations Head) of that team can then delegate/re-assign it to specific team members.

### Phase 4J: FIP Payment & TL Allocation Module
* **FIP Payments:** Finance Payment (FIP) users receive FIH-approved budgets. They select budgets and allocate payments (via wire transfer, cash, etc.) and mark them as Paid.
* **Comment Logic:** Require comments for partial payments (under-paying) or over-payments explaining the discrepancy. Comments are optional if payment matches budget.
* **TL Receipt & Bucket Allocation:** Team Leads (TL) receive payment notifications, change status to received (fully/partially), and assign funds to their active buckets.

### Phase 5A: Core Modules Expansion
* **Goal Tracker:** Standalone UI for monthly activity commitments and daily progress tracking.
* **Housing Registry:** Database of properties, lease terms, utility costs, and transfer workflows.
* **Donor Manager:** Donor profile database with M:N staff assignments and approval requests.
* **Activity Metrics:** Log daily outreach metrics and social media engagement stats.
* **OPH Group Budgeting:** Bundle approved budgets from multiple teams into single department packages.

### Phase 6: Basic CRM & Profile Lifecycles
* **Status Transitions:** Record history of user types: Adheenavasi (Permanent resident), Kailasavasi (E-citizen), program participant, donor, and volunteer.
* **Contribution Log:** Track volunteer seva details, donation amounts, dates, and call history records.

### Phase 7: Document Management & Expiry Escapes
* **Government IDs:** Store passport, visa, and local IDs (Aadhaar, PAN) with expiry dates.
* **Advance Alert Engine:** Initiate alerts 1 year before passport expiry for Adheenavasis. Escalate updates every 2 weeks to User, TL, and OPH.
* **Document Ownership:** Support lease agreements, taxes, and software licenses mapped to users or teams. Escalations trigger TL/OPH/CAO dashboards based on ownership.
* **Donor Updates:** Improve donor UX—only show confirmation prompts referencing stored document numbers instead of requiring repeated uploads.
* **Secure Storage:** Create a separate, encrypted/restricted bucket or folder path on Cloudflare R2 for privacy documents.

### Phase 8: Messaging & Security Upgrades
* **Advanced Chats:** Support broadcast messages to group teams, read receipts, and silent mode toggles.
* **System Broadcasts:** Route system notifications from Finance, Tasks, or Gurukul as messages containing deep links to the target features.
* **Unified Konnect Approvals & Alert Center:** Consolidate all application transactions, dashboard updates, alerts, and approval workflow state changes into a single stream of deep-linked messages delivered on Konnect to the respective OPL/OPH/Admins. Users monitor action items in Konnect and click the messages to open the corresponding app (Finance, Tasks, etc.) to perform the action.

### Phase 9: Custom Password Rules & Boss Resets
* **Password Policy:** Minimum 8 characters, 1 uppercase, 1 special character, 1 number. Must not contain the words: `name`, `Nithya`, `Ananda`, `Shiva`, `Kailasa`.
* **Delegated Resets:** Send password reset approval/notification to the user's immediate boss.

### Phase 10: Organizational AI Insights & Self-Refinement
* **AI Search & Retrieval:** Integrate semantic search across tasks, messages, and budget comments.
* **Executive Summaries:** Generate high-level organizational insight report for CEO/CAO on operational performance, team workloads, and bottleneck areas.
* **Self-Refinement Audit:** Configure AI analysis to identify patterns of user struggles, slow approval times, or frequent clarifications to recommend UI/feature refinements.
