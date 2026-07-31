# Project Roadmap & Pending Backlog

This document tracks all completed and pending project phases. It acts as the single source of truth for planning upcoming development sprints.

---

## Roadmap Phases

| Phase | Title | Description | Status |
| :--- | :--- | :--- | :--- |
| **Phase 4E** | Tabbed User Panel & Granular Permissions | Organize User Admin into Identity, Teams, and App Access tabs. Add dynamic filters for bulk checking and custom permission overrides. | Pending |
| **Phase 4F** | Team Hierarchy & Cross-Department Roles | Implement recursive parent-child team structures (e.g. India Gurukul under Global Gurukul/India ALL) and department-specific team roles. | Pending |
| **Phase 4G** | Leadership Hotline & Security Overrides | Build the emergency hotline to bypass normal gender/team constraints, including CAO management tools to suspend hotline access. | Pending |
| **Phase 4H** | Impersonation & Shadowing Mode | Create a read-only viewer mode for CEO/CAO and authorized staff to replicate user-level views of chats and tasks. | Pending |
| **Phase 4I** | Tasks & Guruvak (Instructions) System | Implement specific Guruvak instructions tagged in the task system, search/filter improvements, and a larger, user-friendly task message UI. | Pending |
| **Phase 4J** | FIP Payment & TL Allocation Module | Build the finance payment module where FIP allocates payments to budgets (with comment logic for partial/over-payments) and TL allocates received funds to buckets. | Pending |
| **Phase 5A** | Core Modules Expansion (Phase 2 core) | Implement Goal tracking, Housing database, Donor database, Social media/Outreach tracking, and OPH Group budgeting. | Pending |
| **Phase 5B** | Database Role Rename | Run migration to rename legacy DB role codes (`member` -> `ops`, `lead` -> `opl`, `oht` -> `oph`) to match UI displays. | Deferred |
| **Phase 6** | Basic CRM & Profile Lifecycles | Track user status history (Adheenavasi/Kailasavasi transitions), seva/volunteering logs, donation history, and basic call tracking. | Future |
| **Phase 7** | Document Management & Expiry Escapes | Track passports, visas, licenses, and tax docs with 1-year advance alerts for passports (escalating to TL/OPH every 2 weeks). Add secure R2 storage folders. | Future |
| **Phase 8** | Messaging & Security Upgrades | Add broadcast channels, silent mode, read receipts, and system alerts delivered directly into messaging channels. | Future |
| **Phase 9** | Custom Password Rules & Boss Resets | Enforce custom password constraints and route user password reset authorizations directly to their immediate boss. | Future |
| **Phase 10** | Organizational AI Insights & Self-Refinement | Integrate AI tools to analyze system data, extract leadership insights, identify procedural bottlenecks, and propose application feature improvements. | Future |

---

## Detailed Phase Breakdown

### Phase 4E: Tabbed User Panel & Granular Permissions
* **Tabbed Interface:** Refactor user select modal in `ok-admin.js` into three tabs: Profile, Teams, App Permissions.
* **Inline Team Management:** Assign users to teams and set their access level (OPS, OPL, OPH, View) directly from Tab 2.
* **Override Controls:** Provide checkable rules for allowing opposite-gender contact, specific role contacts, and department-wide messaging.
* **Bulk Select Filter:** Add filter dropdowns (by Gender, Role, Department, Region) that generate checkbox lists for bulk adding/removing individual clearances.

### Phase 4F: Team Hierarchy & Cross-Department Roles
* **Association Schema:** Create `team_relationships` table for M:N parent-child mapping.
* **Recursive Resolution:** Update database functions/RLS to recognize sub-teams recursively (e.g., broadcasting to a parent team includes members of all sub-teams).
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
