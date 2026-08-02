# One Kailasa Database Schema Documentation

This document serves as the single source of truth for the database schema, custom PL/pgSQL functions, triggers, and Row-Level Security (RLS) policies of the One Kailasa system.

---

## 1. Core Tables

### `public.users`
Stores user profile information and global organization roles.
* `id` (`UUID`, PK): Matches the Supabase Auth user ID.
* `name` (`TEXT`): User's display name.
* `email` (`TEXT`, Unique): User's primary email.
* `role` (`TEXT`): Global org role (`user`, `fin`, `fip`, `oh`, `caoh`, `ceo`, `admin`).
* `gender` (`TEXT`): Monastic category classification (`male`, `female`).
* `clearance_level` (`TEXT`): Messaging access clearance (`restricted`, `standard`, `supervisor`).
* `escalation_tokens` (`INTEGER`): Count of remaining escalation strikes (0 to 3, default 3).
* `created_at` (`TIMESTAMPTZ`): Profile creation date.

### `public.teams`
Groups of users representing departments, geographic locations, or projects.
* `id` (`UUID`, PK): Unique team identifier.
* `name` (`TEXT`, Unique): Display name of the team.
* `is_personal_team` (`BOOLEAN`): Set to true for private individual work teams.
* `gender_scope` (`TEXT`): Monastic team classification restrictions (`male`, `female`, `mixed`).
* `has_budget_access` (`BOOLEAN`): True if team has Budget and Expense features active.
* `has_tasks_access` (`BOOLEAN`): True if team has Task and Issue Tracker active.
* `has_lms_access` (`BOOLEAN`): True if team has Gurukul LMS features active.
* `team_type` (`TEXT`): Custom tier label (e.g. 'Department', 'Division').
* `department` (`TEXT`): Scoped department classification (e.g. 'Finance', 'Legal').
* `prefix` (`VARCHAR(10)`, Unique): Persistent task numbering code (e.g. 'DUB', 'GBB').
* `created_at` (`TIMESTAMPTZ`): Creation timestamp.

### `public.team_relationships`
Stores parent-child relationships between teams for hierarchical routing and visibility.
* `parent_id` (`UUID`, PK): References `public.teams(id)`.
* `child_id` (`UUID`, PK): References `public.teams(id)`.
* `created_at` (`TIMESTAMPTZ`): Association timestamp.

### `public.user_teams`
Maps users to teams with specific permission levels.
* `id` (`UUID`, PK): Unique association ID.
* `user_id` (`UUID`): References `public.users(id)`.
* `team_id` (`UUID`): References `public.teams(id)`.
* `access_level` (`TEXT`): Member permission (`view`, `member` [OPS], `lead` [OPL], `oht` [OPH], `admin`).
* `is_active` (`BOOLEAN`): Set to false to temporarily suspend membership.

### `public.approval_requests`
Primary table for workflows requiring approval (budgets, transfers, reconciliations).
* `id` (`UUID`, PK)
* `request_number` (`TEXT`, Unique): Automated identifier (e.g. `REQ-10023`).
* `request_type` (`TEXT`): Workflow class (`budget`, `money_transfer`, `reconciliation_adjustment`).
* `status` (`TEXT`): Flow status state (e.g., `DRAFT`, `SUBMITTED`, `CAO-REVIEWED`, `PAID`, `RECEIVED`).
* `current_step_order` (`INTEGER`): Active sequential step index in the flow.
* `current_role_code` (`TEXT`): Active role code (e.g. `FIN`, `FIH`, `CAO`, `FIP`).
* `clarified_by_role` (`TEXT`): Stores the role that initiated a clarification loop to return it back on reply.
* `team_id` (`UUID`): References `public.teams(id)`.

### `public.tasks`
Unified common task tracker for all applications.
* `id` (`UUID`, PK)
* `task_number` (`TEXT`, Unique): Human-friendly prefix ID (e.g. `GUR-100024`, `FIN-000456`).
* `title` (`TEXT`), `description` (`TEXT`)
* `status` (`TEXT`): `'todo'`, `'in_progress'`, `'completed'`, `'backlog'`.
* `priority` (`TEXT`): `'low'`, `'medium'`, `'high'`.
* `assigned_to` (`UUID`): References `public.users(id)`.
* `team_id` (`UUID`): References `public.teams(id)`.
* `context_app` (`TEXT`): App code identifier (`finance`, `gurukul`, `legal`).
* `context_id` (`UUID`): Polymorphic reference.
* `metadata` (`JSONB`): Variable custom fields.

### `public.messages`
Unified common communication log (Direct messages, team chats, role queues, and system notifications).
* `id` (`UUID`, PK)
* `sender_id` (`UUID`): References `public.users(id)`.
* `recipient_type` (`TEXT`): `'user'`, `'team'`, `'role'`.
* `recipient_id` (`TEXT`): Holds target UUID or Role Code.
* `body` (`TEXT`): Text content.
* `attachment_url` (`TEXT`), `attachment_name` (`TEXT`): File attachments (R2 keys).
* `allow_replies` (`BOOLEAN`): False for read-only instructions or system logs.
* `metadata` (`JSONB`): Direct deep-links and custom parameters.
* `read_at` (`TIMESTAMPTZ`): Timestamp when marked read by recipient(s).

### `public.ok_app_admins`
Maps app codes (modules) to specific users as local app/module administrators.
* `id` (`UUID`, PK)
* `app_code` (`TEXT`): Code of the application (e.g. `'finance'`, `'gurukul'`).
* `user_id` (`UUID`): References `public.users(id)`.
* `created_at` (`TIMESTAMPTZ`): Creation timestamp.

### `public.ok_app_access`
Enables app/module access clearance for users, scoped by team.
* `user_id` (`UUID`, PK): References `public.users(id)`.
* `team_id` (`UUID`, PK): References `public.teams(id)`.
* `app_code` (`TEXT`, PK): Allowed values: `'finance'`, `'gurukul'`, `'utilities'`, `'tasks'`, `'konnect'`.
* `enabled` (`BOOLEAN`): True if app is enabled.

### `public.ok_menu_access`
Enables granular menu access within applications, scoped by team.
* `user_id` (`UUID`, PK): References `public.users(id)`.
* `team_id` (`UUID`, PK): References `public.teams(id)`.
* `app_code` (`TEXT`, PK): Allowed values: `'finance'`, `'gurukul'`, `'utilities'`, `'tasks'`, `'konnect'`.
* `menu_key` (`TEXT`, PK): Key representing specific page/menu.
* `enabled` (`BOOLEAN`): True if menu is enabled.

### `public.ok_home_pins`
Stores customized application logos pinned on the user's home screen.
* `user_id` (`UUID`, PK): References `public.users(id)`.
* `app_code` (`TEXT`, PK): Allowed values: `'finance'`, `'gurukul'`, `'utilities'`, `'tasks'`, `'konnect'`.
* `sort_order` (`INTEGER`): Order of display.

### `public.budget_plans`
Stores budget plan proposals, transaction reconciliations, and submission wizard data.
* `id` (`UUID`, PK)
* `team_id` (`UUID`): References `public.teams(id)`.
* `name` (`TEXT`): Proposed budget name.
* `status` (`TEXT`): Workflow state.
* `budget_type` (`TEXT`): `'monthly'` or `'adhoc'`.
* `calendar_entry_id` (`UUID`): Period calendar link.
* `budget_period_date` (`DATE`)
* `categories` (`JSONB`): Proposed line-item breakdown.
* `total_amount` (`NUMERIC`), `spent_amount` (`NUMERIC`)
* `open_budgets_explanation` (`JSONB`): Explanations for unresolved budgets.
* `recon_cash_balance` (`NUMERIC`), `recon_bank_balance` (`NUMERIC`), `recon_remaining_funds` (`NUMERIC`)
* `submission_team_info` (`JSONB`), `submission_housing_info` (`JSONB`)
* `submission_accomplishments` (`JSONB`), `submission_income_report` (`JSONB`)
* `submission_social_media` (`JSONB`), `submission_coursing` (`JSONB`)

---

## 2. Core Custom Functions

### `public.user_has_approval_role(p_user_id UUID, p_role_code TEXT, p_team_id UUID)`
Evaluates if a user has permission to act under a given approval step role:
* Returns `true` if they hold the active assignment in `request_role_assignments` for that team or globally.
* Maps built-in roles implicitly only for `admin` (all roles), `caoh` (`CAO`), and `ceo` (`CEO`). 
* Functional roles `FIH`, `FIN`, and `FIP` must be assigned explicitly via `request_role_assignments`.
* Mapped inside `supabase/migrations/064_pure_role_based_approvals.sql`.

### `public.user_can_act_on_approval_request(p_request_id UUID)`
Determines if the active user can approve or reject the request:
* Evaluates if the user has the role matching the request's `current_role_code`.
* Supports skip-level approval rules (allowing higher-step users to claim lower-step actions).
* Mapped inside `supabase/migrations/037_skip_level_approvals.sql`.

---

## 3. Konnect Messaging Tables (Phase 4)

### `public.chat_groups`
Ad-hoc user-created groups.
* `id` (`UUID`, PK)
* `name` (`TEXT`): Display name of the custom group.
* `created_by` (`UUID`): References `public.users(id)`.

### `public.chat_group_members`
Association table for custom groups.
* `group_id` (`UUID`): References `public.chat_groups(id)`.
* `user_id` (`UUID`): References `public.users(id)`.

### `public.chat_preferences`
Personal pinning preferences.
* `user_id` (`UUID`): References `public.users(id)`.
* `chat_target_type` (`TEXT`): `'user'`, `'team'`, `'group'`.
* `chat_target_id` (`TEXT`): Target identifier.
* `is_pinned` (`BOOLEAN`): True if user pinned this conversation.

### `public.chat_permissions`
Cross-gender and cross-team security filters.
* `user_id` (`UUID`, PK): References `public.users(id)`.
* `allow_opposite_gender` (`BOOLEAN`): Enables messaging users of opposite gender.
* `cross_team_access` (`TEXT`): `'none'`, `'team'`, `'global'`.
* `allowed_users` (`UUID[]`): List of user IDs explicitly allowed for contact.
* `allowed_roles` (`TEXT[]`): List of global roles explicitly allowed for contact.
* `allowed_teams` (`UUID[]`): List of team IDs explicitly allowed for contact.

---

## 4. Konnect Helper Functions

### `public.can_chat_with(user_a UUID, user_b UUID)`
Checks whether user_a is authorized to send direct messages to user_b.
* Blocks messaging if genders differ unless both have `allow_opposite_gender = true`.
* Restricts messaging boundaries if cross-team rules are `'none'` (restricting to shared teams).

### `public.get_sub_teams_recursive(p_team_id UUID)`
Returns all sub-team IDs recursively descending from the given parent team.

### `public.get_parent_teams_recursive(p_team_id UUID)`
Returns all parent team IDs recursively ascending from the given child team.

---

## 5. RLS Policies Added / Modified
* **`public.messages`**:
  * `select_messages`: Allows reading messages sent by you, sent directly to you (passing `can_chat_with`), shared in your teams, shared in your custom groups, role assignments matching CAO/FIH, or budget plan comments matching the user's role code specified in `visible_to` metadata (e.g. OPL, OPH, FIN, FIH, CAO, FIP).
  * `insert_messages`: Allows sending messages to direct/group/role recipients, and restricts team channel messaging to team members or users with privileged global roles (fin, fip, oh, caoh, ceo, admin).
  * `update_messages`: Allows updating messages (specifically `read_at`) if you are the sender, direct recipient, or a member of the target team or group.
* **`public.chat_groups` & `public.chat_group_members`**:
  * Restricts access to group creators and group members using recursion-safe `is_group_member` checks.
* **`public.users`**:
  * `users_select_all`: Allows all authenticated users to read basic profile records (fixing name lookup joins).
